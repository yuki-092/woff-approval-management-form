exports.handler = async (event) => {
  const params = {
    TableName: 'your-table-name', // DynamoDB のテーブル名
    FilterExpression: 'approver1Status = :status1 OR approver2Status = :status2',
    ExpressionAttributeValues: {
      ':status1': '承認待ち',
      ':status2': '承認待ち'
    }
  };

  try {
    const data = await dynamoDB.scan(params).promise();
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // CORS ヘッダーを追加
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ items: data.Items })
    };
  } catch (error) {
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