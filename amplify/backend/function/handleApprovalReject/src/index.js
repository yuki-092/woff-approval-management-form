const axios = require('axios');
const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const dynamoDb = new AWS.DynamoDB.DocumentClient();

const secrets = new AWS.SecretsManager();

// ---- Secrets Manager 取得（JSON想定）＋ 単純キャッシュ ----
const __secretCache = new Map();
async function getSecretJSON(secretId) {
  if (!secretId) return null;
  if (__secretCache.has(secretId)) return __secretCache.get(secretId);
  try {
    const res = await secrets.getSecretValue({ SecretId: secretId }).promise();
    const raw =
      res.SecretString ||
      (res.SecretBinary ? Buffer.from(res.SecretBinary, 'base64').toString('utf8') : '');
    const json = raw ? JSON.parse(raw) : null;
    __secretCache.set(secretId, json);
    return json;
  } catch (e) {
    console.error('[secrets] GetSecretValue failed', {
      secretId,
      name: e?.name,
      code: e?.code,
      message: e?.message,
      statusCode: e?.$metadata?.httpStatusCode,
      requestId: e?.$metadata?.requestId,
    });
    throw e;
  }
}
const pick = (v, fb) => (v ?? fb);


// ---- BOT設定の検証（Secrets or Env）----
function mask(s, opts = { head: 4, tail: 4 }) {
  if (!s || typeof s !== 'string') return '';
  const { head, tail } = opts; if (s.length <= head + tail) return '*'.repeat(Math.max(4, s.length));
  return `${s.slice(0, head)}***${s.slice(-tail)}`;
}

function validateBotConfig(prefix, sec) {
  const clientId = pick(sec?.client_id, process.env[`${prefix}_CLIENT_ID`]);
  const clientSecret = pick(sec?.client_secret, process.env[`${prefix}_CLIENT_SECRET`]);
  const privateKey = pick(sec?.private_key, process.env[`${prefix}_PRIVATE_KEY`]);
  const serviceAccount = pick(sec?.service_account, process.env[`${prefix}_SERVICE_ACCOUNT`]);
  const botId = pick(sec?.bot_id ?? sec?.botId, process.env[`${prefix}_BOT_ID`]);

  console.log(`[cfg:${prefix}] client_id=${mask(clientId)} service_account=${serviceAccount || ''} private_key_len=${privateKey ? privateKey.length : 0} bot_id=${botId || ''}`);

  const missing = [];
  if (!clientId) missing.push(`${prefix}_CLIENT_ID`);
  if (!clientSecret) missing.push(`${prefix}_CLIENT_SECRET`);
  if (!privateKey) missing.push(`${prefix}_PRIVATE_KEY`);
  if (!serviceAccount) missing.push(`${prefix}_SERVICE_ACCOUNT`);
  if (!botId) missing.push(`${prefix}_BOT_ID`);
  if (missing.length) {
    throw new Error(`[cfg:${prefix}] 必須の設定が不足しています: ${missing.join(', ')}`);
  }

  return { clientId, clientSecret, privateKey, serviceAccount, botId };
}

// ---- LINE WORKS JWT 生成 ----
const generateJWT = (prefix = 'OKABOT', sec = null) => {
  const now = Math.floor(Date.now() / 1000);
  const iss = pick(sec?.client_id, process.env[`${prefix}_CLIENT_ID`]);
  const sub = pick(sec?.service_account, process.env[`${prefix}_SERVICE_ACCOUNT`]);
  const rawPk = pick(sec?.private_key, process.env[`${prefix}_PRIVATE_KEY`]) || '';
  const fixedPrivateKey = rawPk.replace(/\\n/g, '\n');

  if (!iss || !sub || !fixedPrivateKey) {
    throw new Error(`[jwt:${prefix}] 不足: iss(${!!iss}), sub(${!!sub}), pk_len=${fixedPrivateKey.length}`);
  }

  const payload = { iss, sub, iat: now, exp: now + 3600 };
  try {
    const token = jwt.sign(payload, fixedPrivateKey, { algorithm: 'RS256' });
    console.log(`[jwt:${prefix}] 生成OK iss=${mask(iss)} sub=${sub}`);
    return token;
  } catch (e) {
    console.error(`[jwt:${prefix}] 署名失敗:`, e?.message || e);
    throw e;
  }
};

// ---- load and validate helper ----
async function loadAndValidate(prefix = 'OKABOT') {
  // 固定のSecret名（環境変数による切替は行わない）
  const secretId = prefix === 'OKABOT' ? 'okkabot/credentials' : 'shirakibot/credentials';
  let sec = null;
  try {
    try {
      const sts = new AWS.STS();
      const ident = await sts.getCallerIdentity({}).promise();
      console.log('[aws] caller', { account: ident?.Account, arn: ident?.Arn });
    } catch (e) {
      console.warn('[aws] getCallerIdentity failed', e?.message || e);
    }
    sec = await getSecretJSON(secretId);
    console.log(`Secrets loaded for ${prefix} from`, secretId);
  } catch (e) {
    console.warn(`Failed to load secret for ${prefix} from ${secretId}; fallback to env:`, e?.message || e);
  }
  const cfg = validateBotConfig(prefix, sec);
  return { sec, cfg };
}

// ---- LINE WORKS AccessToken 取得 ----
const getAccessToken = async (prefix = 'OKABOT') => {
  try {
    const { sec, cfg } = await loadAndValidate(prefix);

    console.log(`start: アクセストークン作成 (${prefix})`);
    const assertion = generateJWT(prefix, sec);
    const params = new URLSearchParams();
    params.append('assertion', assertion);
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.append('client_id', cfg.clientId);
    params.append('client_secret', cfg.clientSecret);
    params.append('scope', 'bot');

    const url = 'https://auth.worksmobile.com/oauth2/v2.0/token';
    console.log(`[token:${prefix}] POST ${url}`);
    const tokenRes = await axios.post(url, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    console.log(`[token:${prefix}] status=${tokenRes.status}`);

    if (!tokenRes.data?.access_token) {
      console.error(`[token:${prefix}] 応答にaccess_tokenなし`, tokenRes.data);
      throw new Error('アクセストークンが取得できませんでした');
    }

    const accessToken = tokenRes.data.access_token;
    console.log(`アクセストークン取得成功(${prefix}): len=${String(accessToken).length}`);
    return accessToken;
  } catch (error) {
    if (error.response) {
      console.error(`[token:${prefix}] HTTP ${error.response.status}`, error.response.data);
    }
    console.error(`通知送信エラー(${prefix}):`, error?.message || error);
    throw error;
  }
};

async function getAccessTokenAndConfig(prefix = 'OKABOT') {
  const { sec, cfg } = await loadAndValidate(prefix);
  try {
    console.log(`start: アクセストークン作成 (${prefix})`);
    const assertion = generateJWT(prefix, sec);
    const params = new URLSearchParams();
    params.append('assertion', assertion);
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.append('client_id', cfg.clientId);
    params.append('client_secret', cfg.clientSecret);
    params.append('scope', 'bot');

    const url = 'https://auth.worksmobile.com/oauth2/v2.0/token';
    console.log(`[token:${prefix}] POST ${url}`);
    const tokenRes = await axios.post(url, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    console.log(`[token:${prefix}] status=${tokenRes.status}`);

    if (!tokenRes.data?.access_token) {
      console.error(`[token:${prefix}] 応答にaccess_tokenなし`, tokenRes.data);
      throw new Error('アクセストークンが取得できませんでした');
    }

    const accessToken = tokenRes.data.access_token;
    console.log(`アクセストークン取得成功(${prefix}): len=${String(accessToken).length}`);
    return { accessToken, cfg };
  } catch (error) {
    if (error.response) {
      console.error(`[token:${prefix}] HTTP ${error.response.status}`, error.response.data);
    }
    console.error(`通知送信エラー(${prefix}):`, error?.message || error, { prefix, botId: cfg?.botId });
    throw error;
  }
}

// ---- 個人情報変更: createdAt 解決（applicantId + requestId で特定、なければ userId で後方互換）----
async function resolvePersonalInfoCreatedAt(tableName, userId, requestId) {
    console.log('resolvePersonalInfoCreatedAt: start', { tableName, userId, requestId });
    if (!userId || !requestId) throw new Error('userId and requestId are required to resolve createdAt');
  
    // まずは applicantId で検索（DBスキーマに合わせる）
    const scanByApplicant = {
      TableName: tableName,
      FilterExpression: '#aid = :uid AND #rid = :rid',
      ExpressionAttributeNames: { '#aid': 'applicantId', '#rid': 'requestId' },
      ExpressionAttributeValues: { ':uid': userId, ':rid': requestId },
      ProjectionExpression: 'requestId, applicantId, createdAt'
    };
    let res = await dynamoDb.scan(scanByApplicant).promise();
    console.log('resolvePersonalInfoCreatedAt: scan applicantId result', { count: res.Count });
  
    // 見つからなければ旧フィールド(userId)で後方互換検索
    if ((res.Items || []).length === 0) {
      const scanByUser = {
        TableName: tableName,
        FilterExpression: '#uid = :uid AND #rid = :rid',
        ExpressionAttributeNames: { '#uid': 'userId', '#rid': 'requestId' },
        ExpressionAttributeValues: { ':uid': userId, ':rid': requestId },
        ProjectionExpression: 'requestId, userId, createdAt'
      };
      res = await dynamoDb.scan(scanByUser).promise();
      console.log('resolvePersonalInfoCreatedAt: scan userId (fallback) result', { count: res.Count });
    }
  
    const item = (res.Items || [])[0];
    if (!item || !item.createdAt) {
      console.error('resolvePersonalInfoCreatedAt: not found', { count: res.Count });
      throw new Error('対象の個人情報変更レコードが見つかりません（createdAt解決失敗）');
    }
    console.log('resolvePersonalInfoCreatedAt: ok', { createdAt: item.createdAt });
    return item.createdAt;
  }

exports.handler = async (event) => {
  try {
    console.log("Received event:", JSON.stringify(event, null, 2));
    console.log('[routing] bots: Ringi/Leave=OKABOT, PersonalInfo: next->SHIRAKIBOT, applicant->OKABOT');

    if (event.requestContext?.http?.method === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
        body: JSON.stringify({ message: "CORSプリフライト通過" }),
      };
    }

    if (!event.body) throw new Error("Request body is missing.");

    const {
      requestId,
      approverNumber,
      approverId,
      approverName,
      nextApproverId,
      status,
      userId,
      displayName,
      type,
      approverComment
    } = JSON.parse(event.body);

    console.log("Received approval request:", {
      requestId, approverNumber, approverId, approverName,
      nextApproverId, status, userId, displayName, type, approverComment
    });

    const approverNumberInt = Number(approverNumber);
    if (!Number.isInteger(approverNumberInt) || approverNumberInt <= 0) {
      throw new Error(`Invalid approverNumber: ${approverNumber}`);
    }

    let tableName;
    switch (type) {
      case "稟議申請": tableName = "RingiRequests"; break;
      case "休暇申請": tableName = "LeaveRequests"; break;
      case "個人情報変更": tableName = "RingiPersonalInfo"; break;
      default: throw new Error(`Unknown request type: ${type}`);
    }

    const approvedAt = new Date().toISOString();

    function getPkNameByType(t) {
      switch (t) {
        case '稟議申請': return 'requestId';
        case '休暇申請': return 'requestId';
        case '個人情報変更': return null;
        default: return 'requestId';
      }
    }

    const pkName = getPkNameByType(type);
    console.log('DynamoDB update target', { tableName, pkName, requestId, userId });

    let key;
    if (type === '個人情報変更') {
      const createdAt = await resolvePersonalInfoCreatedAt(tableName, userId, requestId);
      key = { requestId, createdAt };
    } else {
      key = { [pkName]: requestId };
    }

    const params = {
      TableName: tableName,
      Key: key,
      ExpressionAttributeNames: {
        "#status": `approver${approverNumber}Status`,
        "#approvedAt": `approver${approverNumber}ApprovedAt`
      },
      ExpressionAttributeValues: {
        ":status": status,
        ":approvedAt": approvedAt
      },
      UpdateExpression: `SET #status = :status, #approvedAt = :approvedAt`,
      ConditionExpression: "attribute_exists(requestId)",
      ReturnValues: "UPDATED_NEW"
    };

    if (approverComment) {
      params.ExpressionAttributeValues[":comment"] = approverComment;
      params.ExpressionAttributeNames["#comment"] = `approver${approverNumber}Comment`;
      params.UpdateExpression += `, #comment = :comment`;
    }

    console.log("Updating DynamoDB with params:", params);
    await dynamoDb.update(params).promise();
    console.log("DynamoDB update successful");

    if (status === "承認") {
      if (nextApproverId) {
        console.log("Status is approved, sending notification to next approver");
        const prefix = type === "個人情報変更" ? 'SHIRAKIBOT' : 'OKABOT';
        await sendNotificationToNextApprover(nextApproverId, displayName, type, prefix);
      } else {
        console.log("Final approver, no further approver");
        // 個人情報変更でも申請者はOKABOT通知
        const prefix = 'OKABOT';
        await sendApprovedNotificationToApplicant(userId, type, approverName, approverComment, displayName, prefix);
      }
    } else if (status === "否決") {
      console.log("Status is rejected, sending rejection notification to applicant");
      // 個人情報変更でも申請者はOKABOT通知
      const prefix = 'OKABOT';
      await sendRejectionNotificationToApplicant(userId, type, approverName, approverComment, displayName, prefix);
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
      },
      body: JSON.stringify({ message: 'Status updated successfully!' }),
    };

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
      },
      body: JSON.stringify({ message: 'Failed to update status', error: error.message }),
    };
  }
};

async function sendNotificationToNextApprover(nextApproverId, displayName, type, prefix) {
  try {
    console.log(`次の承認者への通知を送信 (prefix=${prefix})`);
    const { accessToken, cfg } = await getAccessTokenAndConfig(prefix);
    const botId = cfg.botId;
    const recieverId = nextApproverId;
    const apiUrl = `https://www.worksapis.com/v1.0/bots/${botId}/users/${recieverId}/messages`;
    const messageData = {
      content: {
        type: 'text',
        text: `次の承認者です。申請内容を確認してください。\n申請者：${displayName}\n申請区分：${type}`
      }
    };
    console.log('Sending notification to next approver:', { prefix, apiUrl, recieverId, type, displayName });
    const response = await axios.post(apiUrl, messageData, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    });
    console.log('通知送信成功:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('HTTP Error:', error.response.status, error.response.data);
    }
    console.error('Error sending notification to next approver:', error?.message || error);
    console.error('sendNotificationToNextApprover failed context', { prefix, nextApproverId, type });
  }
}

async function sendApprovedNotificationToApplicant(userId, type, approverName, approverComment, displayName, prefix = 'OKABOT') {
  try {
    console.log(`申請者への承認完了通知 (prefix=${prefix})`);
    const { accessToken, cfg } = await getAccessTokenAndConfig(prefix);
    const botId = cfg.botId;
    const apiUrl = `https://www.worksapis.com/v1.0/bots/${botId}/users/${userId}/messages`;
    const messageData = {
      content: {
        type: 'text',
        text: `申請が最終承認されました。\n申請者：${displayName}\n申請区分：${type}\n最終承認者：${approverName || ''}\nコメント：${approverComment || ''}`
      }
    };
    console.log('Sending approved notification to applicant:', { apiUrl, userId, type, approverName, prefix });
    const response = await axios.post(apiUrl, messageData, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    });
    console.log('Approved notification sent to applicant', response.data);
  } catch (error) {
    if (error.response) {
      console.error('HTTP Error:', error.response.status, error.response.data);
    }
    console.error('Error sending approved notification to applicant:', error?.message || error);
    console.error('sendApprovedNotificationToApplicant failed context', { prefix, userId, type });
  }
}

async function sendRejectionNotificationToApplicant(userId, type, approverName, approverComment, displayName, prefix = 'OKABOT') {
  try {
    console.log(`申請者へ否決通知を送信 (prefix=${prefix})`);
    const { accessToken, cfg } = await getAccessTokenAndConfig(prefix);
    const botId = cfg.botId;
    const apiUrl = `https://www.worksapis.com/v1.0/bots/${botId}/users/${userId}/messages`;
    const messageData = {
      content: {
        type: 'text',
        text: `申請が否決されました。\n申請者：${displayName}\n申請区分：${type}\n否決者：${approverName || ''}\nコメント：${approverComment || ''}`
      }
    };
    console.log('Sending rejection notification to applicant:', { apiUrl, userId, type, approverName, prefix });
    const response = await axios.post(apiUrl, messageData, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    });
    console.log('Rejection notification sent to applicant', response.data);
  } catch (error) {
    if (error.response) {
      console.error('HTTP Error:', error.response.status, error.response.data);
    }
    console.error('Error sending rejection notification to applicant:', error?.message || error);
    console.error('sendRejectionNotificationToApplicant failed context', { prefix, userId, type });
  }
}