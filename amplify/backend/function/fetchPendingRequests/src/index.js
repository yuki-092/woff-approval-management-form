const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient(); 

exports.handler = async (event) => {
  console.log('#### START fetch data');

  // Define approvers for leave and ringi
  const leaveApprovers = ['approver1', 'approver2'];
  const ringiApprovers = ['approver1', 'approver2', 'approver3', 'approver4'];

  // Helper function to build filter expressions
  const buildFilterParams = (approvers, tableName) => {
    const filterExpressions = [];
    const expressionAttributeValues = {};
    approvers.forEach((approver, index) => {
      const key = `:status${index + 1}`;
      filterExpressions.push(`${approver}Status = ${key}`);
      expressionAttributeValues[key] = '承認待ち';
    });

    return {
      TableName: tableName,
      FilterExpression: filterExpressions.join(' OR '),
      ExpressionAttributeValues: expressionAttributeValues
    };
  };

  const paramsLeaveRequests = buildFilterParams(leaveApprovers, process.env.TABLE_NAME_LEAVE_REQUESTS);
  const paramsRingiRequests = buildFilterParams(ringiApprovers, process.env.TABLE_NAME_RINGI_REQUESTS);

  try {
    const [leaveData, ringiData] = await Promise.all([
      dynamoDB.scan(paramsLeaveRequests).promise(),
      dynamoDB.scan(paramsRingiRequests).promise()
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
        submittedAt: item.submittedAt,
        transferWorkDate: item.transferWorkDate,
        transferLeaveDate: item.transferLeaveDate
      };
    });

    const formattedRingiData = ringiData.Items.map(item => {
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
        storeName: item.storeName,
        userId: item.userId,
        displayName: item.displayName,
        type: item.type,
        approvers: approversArray,
        departmentName: item.departmentName,
        status: item.status,
        submittedAt: item.submittedAt,
        documentType: item.documentType,
        attachmentFiles: item.attachmentFiles,
        otherAttachmentFiles: item.otherAttachmentFiles,
        amount: item.amount,
        content: item.content
      };
    });

    console.log("SUCCESS: " + JSON.stringify({
      leaveRequests: {
        type: '休暇申請',
        approvers: leaveApprovers,
        items: formattedLeaveData
      },
      ringiRequests: {
        type: '稟議申請',
        approvers: ringiApprovers,
        items: formattedRingiData
      }
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
          approvers: leaveApprovers,
          items: formattedLeaveData
        },
        ringiRequests: {
          type: '稟議申請',
          approvers: ringiApprovers,
          items: formattedRingiData
        }
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