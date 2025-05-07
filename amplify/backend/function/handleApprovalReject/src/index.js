const axios = require('axios');
const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const dynamoDb = new AWS.DynamoDB.DocumentClient();


// JWT生成用関数（LINE WORKSのサービスアカウント証明書を利用）
const generateJWT = () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: process.env.CLIENT_ID,
      sub: process.env.SERVICE_ID,
      iat: now,
      exp: now + 3600
    };
    // サービスアカウントの秘密鍵で署名
    const fixedPrivateKey = process.env.PRIVATE_KEY.replace(/\\n/g, '\n');
    const token = jwt.sign(payload, fixedPrivateKey, { algorithm: 'RS256' });
    return token
  };

// JWT generation function for LINE WORKS service account
const getAccessToken = async () => {
    try {

        console.log("start: 承認者1に通知送信");
        // JWT生成
        const assertion = generateJWT();
    
        // アクセストークン取得
        const params = new URLSearchParams();
        params.append('assertion', assertion);
        params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
        params.append('client_id', process.env.CLIENT_ID);
        params.append('client_secret', process.env.CLIENT_SECRET);
        params.append('scope', 'bot');
    
        const tokenRes = await axios.post(
          'https://auth.worksmobile.com/oauth2/v2.0/token',
          params,
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        if (!tokenRes.data.access_token) {
          throw new Error('アクセストークンが取得できませんでした');
        }
        const accessToken = tokenRes.data.access_token;
        console.log("アクセストークン取得成功:", accessToken);
        return accessToken;
    }catch (error) {
        console.error("通知送信エラー:", error);
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

        const { requestId, approverNumber, approverName, nextApproverId, status, userId, displayName, type, approverComment } = JSON.parse(event.body);

        console.log("Received approval request:", { requestId, approverNumber, approverName, nextApproverId, status, userId, displayName, type, approverComment });

        // If approverComment is null or undefined, use an empty string to avoid errors in the UpdateExpression
        const commentValue = approverComment || "";

        // Define the approvedAt date
        const approvedAt = new Date().toISOString();

        const params = {
            TableName: "LeaveRequests",
            Key: {
                "requestId": requestId // Use the provided requestId dynamically
            },
            ExpressionAttributeNames: {
                "#status": `approver${approverNumber}Status`,  // Dynamic approver status
                "#approvedAt": `approver${approverNumber}ApprovedAt` // Dynamic approved date
            },
            ExpressionAttributeValues: {
                ":status": status,  // Update with the provided status
                ":approvedAt": approvedAt  // Approved date
            },
            UpdateExpression: `SET #status = :status, #approvedAt = :approvedAt`,
            ConditionExpression: "attribute_exists(requestId)",  // Only update if requestId exists
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
                const accessToken = await getAccessToken();
                await sendNotificationToNextApprover(nextApproverId, displayName, type, accessToken);
            } else {
                console.log("Final approver, no further approver");
            }
        } else if (status === "否決") {
            console.log("Status is rejected, sending rejection notification to applicant");
            const accessToken = await getAccessToken();
            await sendRejectionNotificationToApplicant(userId, type, approverName, approverComment, accessToken);
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

// 申請者への否決通知を送信
async function sendRejectionNotificationToApplicant(userId, type, approverName, approverComment, accessToken) {

    try {
        // Lambda環境変数からBot番号を取得
        const botId = process.env.BOT_ID;
        const userId = userId; // 承認者のユーザーIDを指定

        // メッセージ送信APIエンドポイント（正しいURLを使用）
        const apiUrl = `https://www.worksapis.com/v1.0/bots/${botId}/users/${userId}/messages`;

        const messageData = {
            content: {
                type: 'text',
                text: `申請が否決されました。\n申請区分：${type}\n否決者：${approverName}\nコメント：${approverComment}`,
            }
        }

        console.log("Sending rejection notification to applicant:", messageData);

        const response = await axios.post(apiUrl, messageData, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            }
        });
        console.log("Rejection notification sent to applicant", response.data);
    } catch (error) {
        console.error("Error sending rejection notification to applicant:", error);
    }
}

// 次の承認者への通知を送信
async function sendNotificationToNextApprover(nextApproverId, displayName, type, accessToken) {
    try {
        // Lambda環境変数からBot番号を取得
        const botId = process.env.BOT_ID;
        const userId = nextApproverId; // 承認者のユーザーIDを指定

        // メッセージ送信APIエンドポイント（正しいURLを使用）
        const apiUrl = `https://www.worksapis.com/v1.0/bots/${botId}/users/${userId}/messages`;

        const messageData = {
            content: {
                type: 'text',
                text: `次の承認者です。申請内容を確認してください。\n申請者：${displayName}\n申請区分：${type}`,
            }
        }

        console.log("Sending notification to next approver:", messageData);

        const response = await axios.post(apiUrl, messageData, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            }
        });
        console.log("通知送信成功:", response.data);
    } catch (error) {
        console.error("Error sending notification to next approver:", error);
    }
}