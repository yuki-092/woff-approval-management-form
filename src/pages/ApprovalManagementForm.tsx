import React, { useState, useEffect } from "react";

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
  const [approvals, setApprovals] = useState<ApprovalData[]>([]);
  const [filterType, setFilterType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // データを取得する関数
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
        // Transform the data to have approvers array
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

  const filteredApprovals = filterType
    ? approvals.filter((approval) => approval.type === filterType)
    : approvals;

  if (loading) {
    return (
      <div className="loader"></div> // ぐるぐるローディングインジケータを表示
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
                 申請日時: {new Date(approval.submittedAt)
                    .toLocaleString('ja-JP', {
                      timeZone: 'Asia/Tokyo',
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                    .replace(',', '')}
                </div>
              </div>
            </div>
            <div className="approval-body">
              <div><strong>申請者:</strong> {approval.displayName}</div>
              <div><strong>申請する休日:</strong> {approval.type}</div>
              <div><strong>申請期間:</strong> {approval.startDate} 〜 {approval.endDate}</div>
              <div><strong>申請日数:</strong> {approval.days} 日</div>
              {approval.approvers.map((approver, index) => (
                <div className="approver" key={approver.approverId}>
                  <div><strong>承認者{index + 1}</strong></div>
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
                        .toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                    </div>
                  )}
                  {approver.approverStatus === "承認待ち" && (
                    <div className="button-container">
                      <button className="reject-btn">否決</button>
                      <button className="approve-btn">承認</button>
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