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
  const res = await secrets.getSecretValue({ SecretId: secretId }).promise();
  const raw =
    res.SecretString ||
    (res.SecretBinary ? Buffer.from(res.SecretBinary, 'base64').toString('utf8') : '');
  const json = raw ? JSON.parse(raw) : null;
  __secretCache.set(secretId, json);
  return json;
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
  const botId = process.env[`${prefix}_BOT_ID`];

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
// prefix: 'OKABOT' | 'SHIRAKIBOT'
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

// ---- LINE WORKS AccessToken 取得 ----
const getAccessToken = async (prefix = 'OKABOT') => {
  try {
    const secretId = process.env[`${prefix}_SECRET_ID`];
    let sec = null;
    if (secretId) {
      try {
        sec = await getSecretJSON(secretId);
        console.log(`Secrets loaded for ${prefix}`);
      } catch (e) {
        console.warn(`Failed to load secret for ${prefix}; fallback to env:`, e?.message || e);
      }
    }

    // 設定検証＆サマリログ
    const cfg = validateBotConfig(prefix, sec);

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

// ---- 個人情報変更: createdAt 解決（userId + requestId で1件特定）----
async function resolvePersonalInfoCreatedAt(tableName, userId, requestId) {
  console.log('resolvePersonalInfoCreatedAt: start', { tableName, userId, requestId });
  if (!userId || !requestId) throw new Error('userId and requestId are required to resolve createdAt');
  // スキーマが不明なため安全に Scan + Filter で取得（件数は少量想定）
  const scanParams = {
    TableName: tableName,
    FilterExpression: '#uid = :uid AND #rid = :rid',
    ExpressionAttributeNames: { '#uid': 'userId', '#rid': 'requestId' },
    ExpressionAttributeValues: { ':uid': userId, ':rid': requestId },
    ProjectionExpression: 'requestId, userId, createdAt'
  };
  const res = await dynamoDb.scan(scanParams).promise();
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

    // CORS preflight
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
      approverNumber,      // 現在の承認者番号
      approverId,          // 現在の承認者ID
      approverName,        // 現在の承認者名（通知文面用）
      nextApproverId,      // 次の承認者ID（あれば通知）
      status,              // '承認' | '否決'
      userId,              // applicantId
      displayName,         // 申請者名
      type,                // '稟議申請' | '休暇申請' | '個人情報変更' 等
      approverComment      // コメント
    } = JSON.parse(event.body);

    console.log("Received approval request:", {
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
    });

    // --- early validate approverNumber (1-based integer required) ---
    const approverNumberInt = Number(approverNumber);
    if (!Number.isInteger(approverNumberInt) || approverNumberInt <= 0) {
      throw new Error(`Invalid approverNumber: ${approverNumber}`);
    }

    // ---- 稟議 / 休暇 / 個人情報変更----
    let tableName;
    switch (type) {
      case "稟議申請":
        tableName = "RingiRequests";
        break;
      case "休暇申請":
        tableName = "LeaveRequests";
        break;
      case "個人情報変更":
        tableName = "RingiPersonalInfo";
        break;
      default:
        throw new Error(`Unknown request type: ${type}`);
    }

    const approvedAt = new Date().toISOString();

    function getPkNameByType(t) {
      switch (t) {
        case '稟議申請': return 'requestId';
        case '休暇申請': return 'requestId';
        case '個人情報変更': return null; // handled separately
        default: return 'requestId';
      }
    }

    const pkName = getPkNameByType(type);
    console.log('DynamoDB update target', { tableName, pkName, requestId, userId });

    // Key 構築（個人情報は複合キー: requestId + createdAt）
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

    // 通知
    if (status === "承認") {
      if (nextApproverId) {
        console.log("Status is approved, sending notification to next approver");
        // 稟議・休暇の次承認者は OKABOT
        // 個人情報変更のみSHIRAKIBOT
        const prefix = (type === "稟議申請" || type === "休暇申請") ? 'OKABOT' : (type === "個人情報変更" ? 'SHIRAKIBOT' : 'OKABOT');
        await sendNotificationToNextApprover(nextApproverId, displayName, type, prefix);
      } else {
        console.log("Final approver, no further approver");
         // 共通でOKABOT
        const prefix = 'OKABOT';
        await sendApprovedNotificationToApplicant(userId, type, approverName, approverComment, displayName, prefix);
      }
    } else if (status === "否決") {
      console.log("Status is rejected, sending rejection notification to applicant");
      // 個人情報変更のみSHIRAKIBOT
      const prefix = type === '個人情報変更' || type === '個人情報変更申請' || type === 'personalInfo' ? 'SHIRAKIBOT' : 'OKABOT';
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

// ---- 次の承認者への通知（種別で BOT 切替） ----
// 個人情報変更: SHIRAKIBOT / 稟議・休暇: OKABOT
async function sendNotificationToNextApprover(nextApproverId, displayName, type, prefix) {
  try {
    console.log(`次の承認者への通知を送信 (prefix=${prefix})`);

    const accessToken = await getAccessToken(prefix);
    const botId = process.env[`${prefix}_BOT_ID`];
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
  }
}

// ---- 申請者への承認完了通知（OKABOT/SHIRAKIBOT切替） ----
async function sendApprovedNotificationToApplicant(userId, type, approverName, approverComment, displayName, prefix = 'OKABOT') {
  try {
    console.log(`申請者への承認完了通知 (prefix=${prefix})`);
    const accessToken = await getAccessToken(prefix);
    const botId = process.env[`${prefix}_BOT_ID`];
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
  }
}

// ---- 申請者へ否決通知（OKABOT/SHIRAKIBOT切替） ----
async function sendRejectionNotificationToApplicant(userId, type, approverName, approverComment, displayName, prefix = 'OKABOT') {
  try {
    console.log(`申請者へ否決通知を送信 (prefix=${prefix})`);
    const accessToken = await getAccessToken(prefix);
    const botId = process.env[`${prefix}_BOT_ID`];
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
  }
}