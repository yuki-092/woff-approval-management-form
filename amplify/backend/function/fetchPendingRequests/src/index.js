const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient(); 

exports.handler = async (event) => {
  console.log('#### START fetch data');

  const approvers = ['approver1', 'approver2']; // You can add more approvers here

  // Build FilterExpression dynamically
  const filterExpressions = [];
  const expressionAttributeValues = {};
  approvers.forEach((approver, index) => {
    const key = `:status${index + 1}`;
    filterExpressions.push(`${approver}Status = ${key}`);
    expressionAttributeValues[key] = '承認待ち';
  });

  const paramsLeaveRequests = {
    TableName: 'LeaveRequests', // LeaveRequests table
    FilterExpression: filterExpressions.join(' OR '),
    ExpressionAttributeValues: expressionAttributeValues
  };

  try {
    const [leaveData, ringiData] = await Promise.all([
      dynamoDB.scan(paramsLeaveRequests).promise(),
      // dynamoDB.scan(paramsRingiRequests).promise()
    ]);

    const formattedLeaveData = leaveData.Items.map(item => {
      // Reformat the approvers into an array of objects
      const approversArray = [];
      let approverCount = 1;
      while (item[`approver${approverCount}Name`]) {
        approversArray.push({
          approverId: item[`approver${approverCount}Id`],
          approverName: item[`approver${approverCount}Name`],
          approverStatus: item[`approver${approverCount}Status`],
          approverApprovedAt: item[`approver${approverCount}ApprovedAt`],
          approverComment: item[`approver${approverCount}Comment`]
        });
        approverCount++;
      }

      return {
        requestId: item.requestId,
        userId: item.userId,
        displayName: item.displayName,
        type: item.type,
        approvers: approversArray,
        days: item.days,
        departmentName: item.departmentName,
        emergencyContact: item.emergencyContact,
        endDate: item.endDate,
        note: item.note,
        startDate: item.startDate,
        status: item.status,
        submittedAt: item.submittedAt
      };
    });

    console.log("SUCCESS: " + JSON.stringify({
      leaveRequests: {
        type: '休暇申請',
        approvers: approvers,
        items: formattedLeaveData
      },
    }));

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        leaveRequests: {
          type: '休暇申請',
          approvers: approvers,
          items: formattedLeaveData
        },
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