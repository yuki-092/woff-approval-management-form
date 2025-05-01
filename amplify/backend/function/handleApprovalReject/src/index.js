const axios = require('axios');
const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();


// JWT生成用関数（LINE WORKSのサービスアカウント証明書を利用）
const getAccessToken = () => {
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

exports.handler = async (event) => {
    const { requestId, approverNumber, approverName, nextApproverId, status, userId, displayName, type, approverComment } = JSON.parse(event.body);
    console.log("Received approval request:", { requestId, approverNumber, approverName, nextApproverId, status, userId, displayName, type, approverComment });  // Log the incoming request

    const params = {
        TableName: "LeaveRequests",
        Key: {
            "requestId": requestId,
        },
        UpdateExpression: `set approver${approverNumber}Status = :status, approver${approverNumber}ApprovedAt = :approvedAt, approver${approverNumber}Comment = :comment`,
        ExpressionAttributeValues: {
            [`:approver${approverNumber}Status`]: status,
            [`:approver${approverNumber}ApprovedAt`]: new Date().toISOString(),
            [`:approver${approverNumber}Comment`]: approverComment
        },
        ReturnValues: "UPDATED_NEW",
    };

    try {
        console.log("Updating DynamoDB with params:", params);
        await dynamoDb.update(params).promise();
        console.log("DynamoDB update successful");

        // Handle approval flow
        if (status === "承認") {
            if (nextApproverId) {
                console.log("Status is approved, sending notification to next approver");
                const accessToken = await getAccessToken();  // Access Tokenを取得
                await sendNotificationToNextApprover(nextApproverId, displayName, type, accessToken);
            } else {
                console.log("Final approver, no further approver");
                // Optional: Add any final approval flow logic here if needed
            }
        } else if (status === "否決") {
            console.log("Status is rejected, sending rejection notification to applicant");
            await sendRejectionNotificationToApplicant(userId, type, approverName, approverComment);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Status updated successfully!' }),
        };
    } catch (error) {
        console.error("Error updating DB:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to update status' }),
        };
    }
};

async function sendNotificationToNextApprover(nextApproverId, displayName, type, accessToken) {
    const message = {
        botNo: process.env.BOT_ID,
        userId: nextApproverId,
        content: `次の承認者です。申請内容を確認してください。\n申請者：${displayName}\n申請区分：${type}`,
    };

    console.log("Sending notification to next approver:", message);
    try {
        await axios.post(`https://www.worksapis.com/v1.0/bots/${BOT_ID}/users/${nextApproverId}/messages`, message, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            }
        });
        console.log("Notification sent to next approver");
    } catch (error) {
        console.error("Error sending notification to next approver:", error);
    }
}

async function sendRejectionNotificationToApplicant(userId, type, approverName, approverComment) {
    const message = {
        botNo: process.env.BOT_ID,
        userId: userId,
        content: `申請が否決されました。\n申請区分：${type}\n否決者：${approverName}\nコメント：${approverComment}`,
    };

    console.log("Sending rejection notification to applicant:", message);
    try {
        await axios.post(`https://www.worksapis.com/v1.0/bots/${BOT_ID}/users/${userId}/messages`, message);
        console.log("Rejection notification sent to applicant");
    } catch (error) {
        console.error("Error sending rejection notification to applicant:", error);
    }
}