import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';

// Define the types for approver and approval data
type Approver = {
  approverId: string;
  approverStatus: string;
  approverApprovedAt: string;
  approverComment: string;
  approverName: string;
};

type ApprovalData = {
  requestId: string;
  submittedAt: string;
  startDate: string;
  endDate: string;
  type: string;
  days: number;
  displayName: string;
  approvers: Approver[];
  departmentName: string;
  note: string;
  userId: string;
};


export const ApprovalManagementForm = () => {
  const navigate = useNavigate();
  const [approvals, setApprovals] = useState<ApprovalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(
          "https://eoqz5mwu3ipr4figpesygumzhq0eubjk.lambda-url.ap-northeast-1.on.aws/"
        );
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        const data = await response.json();
        console.log("Fetched Data:", data);
        const transformedApprovals = data.leaveRequests.items.map((item: any) => {
          const approvers: Approver[] = item.approvers.map((approver: any) => ({
            approverId: approver.approverId,
            approverStatus: approver.approverStatus,
            approverApprovedAt: approver.approverApprovedAt,
            approverComment: approver.approverComment,
            approverName: approver.approverName,
          }));
          return {
            ...item,
            approvers,
          };
        });
        setApprovals(transformedApprovals);
      } catch (error: any) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleApprovalReject = async (approvalData: any) => {
    console.log("Approval Data:", approvalData);
    setLoading(true);

    // ペイロードを準備
    const payload = {
      requestId: approvalData.requestId,
      approverNumber: approvalData.approverNumber,
      approverName: approvalData.approverName,
      nextApproverId: approvalData.nextApproverId,
      status: approvalData.status,
      userId: approvalData.userId,
      displayName: approvalData.displayName,
      type: approvalData.type,
      approverComment: approvalData.approverComment || "",  // コメントが無い場合は空文字
    };

    try {
      const response = await fetch(
        "https://zrhl6xn4r4z2crfbb34pq5zohe0hdxgd.lambda-url.ap-northeast-1.on.aws/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

        if (response.ok) {
          const result = await response.json();
          console.log("Approval/Rejection processed successfully!", result);

          // 承認処理が完了した後に complete page に遷移
          navigate("/complete");
      } 
    } catch (error) {
      console.error("Error calling Lambda:", error);
      alert('送信中にエラーが発生しました。')
    } finally{
      setLoading(false);
    }
  };

  const filteredApprovals = approvals;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-overlay">
          <div className="loader"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return <div>エラー: {error}</div>;
  }

  return (
    <div className="approval-page">
      <h1 className="approval-title">未承認リスト一覧</h1>
      <div className="approval-list">
        {filteredApprovals?.map((approval) => (
          <div key={approval.requestId} className="approval-card">
            <div className="approval-header">
              <div className="approval-header-top">
                <span className="badge">休暇申請</span>
                <div className="approval-date">
                  申請日時:{" "}
                  {new Date(approval.submittedAt)
                    .toLocaleString("ja-JP", {
                      timeZone: "Asia/Tokyo",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                    .replace(",", "")}
                </div>
              </div>
            </div>
            <div className="approval-body">
              <div>
                <strong>申請者:</strong> {approval.displayName}
              </div>
              <div>
                <strong>申請する休日:</strong> {approval.type}
              </div>
              <div>
                <strong>申請期間:</strong> {approval.startDate} 〜{" "}
                {approval.endDate}
              </div>
              <div>
                <strong>申請日数:</strong> {approval.days} 日
              </div>
              {approval.approvers.map((approver, index) => (
                <div key={`${index}-${approver.approverId}`} className="approver">
                  <div>
                    <strong>承認者{index + 1}</strong>
                  </div>
                  <div className="approver-status-icon">
                    <span>
                      {approver.approverStatus === "承認待ち" && "⏳"}
                      {approver.approverStatus === "承認済み" && "✔️"}
                      {approver.approverStatus === "否決" && "❌"}
                    </span>
                    <span>{approver.approverName}</span>
                  </div>
                  <div className="approver-status">{approver.approverStatus}</div>
                  <div>{approver.approverComment || "ー"}</div>
                  {approver.approverStatus !== "承認待ち" && approver.approverApprovedAt && (
                    <div>
                      <strong>承認日時:</strong>
                      {new Date(approver.approverApprovedAt)
                        .toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                    </div>
                  )}
                  {approver.approverStatus === "承認待ち" && (
                    <div className="button-container">
                      <button
                        className="reject-btn"
                        onClick={() => handleApprovalReject({
                          requestId: approval.requestId,
                          approverNumber: index + 1,
                          approverName: approver.approverName,
                          nextApproverId: approval.approvers[index + 1]?.approverId,
                          status: "否決",
                          userId: approval.userId,
                          displayName: approval.displayName,
                          type: approval.type,
                          approverComment: approver.approverComment,
                        })}
                      >
                        否決
                      </button>
                      <button
                        className="approve-btn"
                        onClick={() => handleApprovalReject({
                          requestId: approval.requestId,
                          approverNumber: index + 1,
                          approverName: approver.approverName,
                          nextApproverId: approval.approvers[index + 1]?.approverId,
                          status: "承認",
                          userId: approval.userId,
                          displayName: approval.displayName,
                          type: approval.type,
                          approverComment: approver.approverComment,
                        })}
                      >
                        承認
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ApprovalManagementForm;