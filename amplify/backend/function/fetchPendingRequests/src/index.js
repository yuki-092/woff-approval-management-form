const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient(); 

exports.handler = async (event) => {
  console.log('#### START fetch data');

  const paramsLeaveRequests = {
    TableName: 'LeaveRequests', // LeaveRequests table
    FilterExpression: 'approver1Status = :status1 OR approver2Status = :status2',
    ExpressionAttributeValues: {
      ':status1': '承認待ち',
      ':status2': '承認待ち'
    }
  };

  // const paramsRingiRequests = {
  //   TableName: 'RingiRequests', // RingiRequests table
  //   FilterExpression: 'approver1Status = :status1 OR approver2Status = :status2',
  //   ExpressionAttributeValues: {
  //     ':status1': '承認待ち',
  //     ':status2': '承認待ち'
  //   }
  // };

  try {
    const [leaveData, ringiData] = await Promise.all([
      dynamoDB.scan(paramsLeaveRequests).promise(),
      // dynamoDB.scan(paramsRingiRequests).promise()
    ]);

    console.log("SUCCESS: " + JSON.stringify({
      leaveRequests: {
        type: '休暇申請',
        items: leaveData.Items
      },
      // ringiRequests: {
      //   type: '稟議書申請',
      //   items: ringiData.Items
      // }
    }))

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        leaveRequests: {
          type: '休暇申請',
          items: leaveData.Items
        },
        // ringiRequests: {
        //   type: '稟議書申請',
        //   items: ringiData.Items
        // }
      })
    };
  } catch (error) {
    console.error('### ERROR:' + error.message);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};