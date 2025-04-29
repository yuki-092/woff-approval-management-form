const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient(); 

exports.handler = async (event) => {
  console.log('#### START fetch data')
  const params = {
    TableName: 'LeaveRequests', // DynamoDB のテーブル名
    FilterExpression: 'approver1Status = :status1 OR approver2Status = :status2',
    ExpressionAttributeValues: {
      ':status1': '承認待ち',
      ':status2': '承認待ち'
    }
  };

  try {
    const data = await dynamoDB.scan(params).promise();
    console.log("SUCCESS: " + JSON.stringify({ items: data.Items }))
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // CORS ヘッダーを追加
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ items: data.Items })
    };
  } catch (error) {
    console.error('### ERROR:' + error.message)
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*", // CORS ヘッダーを追加
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};