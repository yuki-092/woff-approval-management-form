const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient(); 

exports.handler = async (event) => {
  console.log('#### START fetch data');

  const paramsLeaveRequests = {
    TableName: process.env.TABLE_NAME_LEAVE_REQUESTS
  };

  try {
    const leaveData = await dynamoDB.scan(paramsLeaveRequests).promise();

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
        submittedAt: item.submittedAt,
        transferWorkDate: item.transferWorkDate,
        transferLeaveDate: item.transferLeaveDate
      };
    });

    // Remove filtering and return leaveRequests as is
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        leaveRequests: formattedLeaveData
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