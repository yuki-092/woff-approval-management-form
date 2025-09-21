const axios = require('axios');
const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const dynamoDb = new AWS.DynamoDB.DocumentClient();

const secrets = new AWS.SecretsManager();
// Secrets Manager 取得（JSON想定）＋ 単純キャッシュ
const __secretCache = new Map();
async function getSecretJSON(secretId) {
  if (!secretId) return null;
  if (__secretCache.has(secretId)) return __secretCache.get(secretId);
  const res = await secrets.getSecretValue({ SecretId: secretId }).promise();
  const raw = res.SecretString || (res.SecretBinary ? Buffer.from(res.SecretBinary, 'base64').toString('utf8') : '');
  const json = raw ? JSON.parse(raw) : null;
  __secretCache.set(secretId, json);
  return json;
}
const pick = (v, fb) => (v ?? fb);

// prefix に 'OKABOT' | 'SHIRAKIBOT' を渡す。sec があれば Secrets を優先
const generateJWT = (prefix = 'OKABOT', sec = null) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: pick(sec?.client_id, process.env[`${prefix}_CLIENT_ID`]),
    sub: pick(sec?.service_account, process.env[`${prefix}_SERVICE_ACCOUNT`]),
    iat: now,
    exp: now + 3600
  };
  const pk = pick(sec?.private_key, process.env[`${prefix}_PRIVATE_KEY`]) || '';
  const fixedPrivateKey = pk.replace(/\\n/g, '\n');
  return jwt.sign(payload, fixedPrivateKey, { algorithm: 'RS256' });
};

// JWT generation function for LINE WORKS service account
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

    console.log(`start: アクセストークン作成 (${prefix})`);
    const assertion = generateJWT(prefix, sec);
    const params = new URLSearchParams();
    params.append('assertion', assertion);
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.append('client_id', pick(sec?.client_id, process.env[`${prefix}_CLIENT_ID`]));
    params.append('client_secret', pick(sec?.client_secret, process.env[`${prefix}_CLIENT_SECRET`]));
    params.append('scope', 'bot');

    const tokenRes = await axios.post(
      'https://auth.worksmobile.com/oauth2/v2.0/token',
      params,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (!tokenRes.data.access_token) throw new Error('アクセストークンが取得できませんでした');
    const accessToken = tokenRes.data.access_token;
    console.log(`アクセストークン取得成功(${prefix}):`, accessToken ? '***' : '');
    return accessToken;
  } catch (error) {
    console.error(`通知送信エラー(${prefix}):`, error);
    throw error;
  }
};

exports.handler = async (event) => {
    try {
        console.log("Received event:", JSON.stringify(event, null, 2));
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

        if (!event.body) {
            throw new Error("Request body is missing.");
        }

        const { requestId, approverNumber, approverId, nextApproverId, status, userId, displayName, type, approverComment } = JSON.parse(event.body);

        console.log("Received approval request:", { requestId, approverNumber, approverId, nextApproverId, status, userId, displayName, type, approverComment });

        // If approverComment is null or undefined, use an empty string to avoid errors in the UpdateExpression
        const commentValue = approverComment || "";

        // Define the approvedAt date
        const approvedAt = new Date().toISOString();

        const tableName = type === "稟議申請" ? "RingiRequests" : "LeaveRequests";

        // 個人情報変更申請は別テーブル＆別ロジック
        if (type === '個人情報変更' || type === '個人情報変更申請' || type === 'personalInfo') {
          const personalInfoTable = process.env.PERSONAL_INFO_TABLE_NAME || 'RingiPersonalInfo';
          // 1) requestId + applicantId(userId) で Query → createdAt を取得
          const q = {
            TableName: personalInfoTable,
            KeyConditionExpression: '#rid = :rid',
            ExpressionAttributeNames: { '#rid': 'requestId', '#aid': 'applicantId' },
            ExpressionAttributeValues: { ':rid': requestId, ':aid': userId },
            FilterExpression: '#aid = :aid',
            Limit: 2
          };
          console.log('Query personal info by requestId & applicantId', q);
          const qr = await dynamoDb.query(q).promise();
          if (!qr.Items || qr.Items.length === 0) {
            throw new Error('個人情報：対象データが見つかりません');
          }
          const item = qr.Items[0];
          const createdAt = item.createdAt;
          if (!createdAt) throw new Error('個人情報：createdAt が取得できません');

          // approvers 配列の次のPENDINGを特定
          const approvers = Array.isArray(item.approvers) ? item.approvers : [];
          const idx = approvers.findIndex(a => a.approverStatus === 'PENDING' || a.approverStatus === '承認待ち');
          if (idx === -1) {
            console.log('個人情報：PENDINGなし、処理不要');
          } else {
            const now = new Date().toISOString();
            const exprNames = { '#status': 'status' };
            const exprValues = { ':approved': 'APPROVED', ':now': now };
            let updateExp = `SET approvers[${idx}].approverStatus = :approved, approvers[${idx}].approverApprovedAt = :now`;

            const hasNext = approvers.slice(idx + 1).some(a => a.approverStatus === 'PENDING' || a.approverStatus === '承認待ち');
            if (!hasNext) {
              updateExp += `, #status = :finalApproved`;
              exprValues[':finalApproved'] = '承認';
            }

            const up = {
              TableName: personalInfoTable,
              Key: { requestId, createdAt },
              UpdateExpression: updateExp,
              ExpressionAttributeNames: exprNames,
              ExpressionAttributeValues: exprValues,
              ReturnValues: 'UPDATED_NEW'
            };
            console.log('Update personal info approval', up);
            await dynamoDb.update(up).promise();

            // 通知
            if (status === '承認') {
              if (hasNext) {
                const next = approvers.slice(idx + 1).find(a => a.approverStatus === 'PENDING' || a.approverStatus === '承認待ち');
                if (next && next.approverId) {
                  await sendNotificationToNextApprover(next.approverId, displayName, type);
                }
              } else {
                await sendApprovedNotificationToApplicant(userId, type, approverComment, displayName);
              }
            } else if (status === '否決') {
              await sendRejectionNotificationToApplicant(userId, type, approverComment, displayName);
            }
          }

          return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'OPTIONS,POST,GET' },
            body: JSON.stringify({ message: 'Personal info status updated successfully!' })
          };
        }

        if (!approverNumber && type !== '個人情報変更' && type !== '個人情報変更申請' && type !== 'personalInfo') {
          throw new Error('approverNumber is required for this request type');
        }

        const params = {
            TableName: tableName,
            Key: {
                "requestId": requestId
            },
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
            params.ExpressionAttributeValues[":comment"] = commentValue;
            params.ExpressionAttributeNames["#comment"] = `approver${approverNumber}Comment`; // Dynamic comment field
            params.UpdateExpression += `, #comment = :comment`;
        }

        console.log("Updating DynamoDB with params:", params);
        await dynamoDb.update(params).promise();
        console.log("DynamoDB update successful");

        // Handle status updates based on the approval status
        if (status === "承認") {
            if (nextApproverId) {
                console.log("Status is approved, sending notification to next approver");
                await sendNotificationToNextApprover(nextApproverId, displayName, type);
            } else {
                console.log("Final approver, no further approver");
                await sendApprovedNotificationToApplicant(userId, type, approverComment, displayName);
            }
        } else if (status === "否決") {
            console.log("Status is rejected, sending rejection notification to applicant");
            await sendRejectionNotificationToApplicant(userId, type, approverComment, displayName);
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

// 次の承認者への通知を送信
async function sendNotificationToNextApprover(nextApproverId, displayName, type) {
  try {
    console.log('次の承認者への通知を送信');
    const prefix = 'SHIRAKIBOT';
    const accessToken = await getAccessToken(prefix);
    const botId = process.env[`${prefix}_BOT_ID`];
    const recieverId = nextApproverId;
    const apiUrl = `https://www.worksapis.com/v1.0/bots/${botId}/users/${recieverId}/messages`;
    const messageData = {
      content: { type: 'text', text: `次の承認者です。申請内容を確認してください。\n申請者：${displayName}\n申請区分：${type}` }
    };
    console.log('Sending notification to next approver:', messageData);
    const response = await axios.post(apiUrl, messageData, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
    console.log('通知送信成功:', response.data);
  } catch (error) {
    console.error('Error sending notification to next approver:', error);
  }
}

// 申請者への承認完了通知
async function sendApprovedNotificationToApplicant(userId, type, approverComment, displayName) {
  try {
    console.log('申請者への承認完了通知');
    const prefix = 'OKABOT';
    const accessToken = await getAccessToken(prefix);
    const botId = process.env[`${prefix}_BOT_ID`];
    const apiUrl = `https://www.worksapis.com/v1.0/bots/${botId}/users/${userId}/messages`;
    const messageData = {
      content: { type: 'text', text: `申請が最終承認されました。\n申請者：${displayName}\n申請区分：${type}\nコメント：${approverComment || ''}` }
    };
    console.log('Sending approved notification to applicant:', messageData);
    const response = await axios.post(apiUrl, messageData, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
    console.log('Approved notification sent to applicant', response.data);
  } catch (error) {
    console.error('Error sending approved notification to applicant:', error);
  }
}

// 申請やへ否決通知を送信
async function sendRejectionNotificationToApplicant(userId, type, approverComment, displayName) {
  try {
    console.log('申請やへ否決通知を送信');
    const prefix = 'OKABOT';
    const accessToken = await getAccessToken(prefix);
    const botId = process.env[`${prefix}_BOT_ID`];
    const apiUrl = `https://www.worksapis.com/v1.0/bots/${botId}/users/${userId}/messages`;
    const messageData = {
      content: { type: 'text', text: `申請が否決されました。\n申請者：${displayName}\n申請区分：${type}\nコメント：${approverComment || ''}` }
    };
    console.log('Sending rejection notification to applicant:', messageData);
    const response = await axios.post(apiUrl, messageData, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
    console.log('Rejection notification sent to applicant', response.data);
  } catch (error) {
    console.error('Error sending rejection notification to applicant:', error);
  }
}