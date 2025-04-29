import React, { useState, useEffect } from "react";


type ApprovalData = {
  requestId: string;
  submittedAt: string;
  startDate: string;
  endDate: string;
  type: string;
  days: number; 
  displayName: string;
  approver1Id: string;
  approver1Status: string;
  approver1ApprovedAt: string;
  approver1Comment: string;
  approver1Name: string;
  approver2Id: string;
  approver2Status: string;
  approver2ApprovedAt: string;
  approver2Comment: string;
  approver2Name: string;
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
        setApprovals(data.leaveRequests.items);
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
      <div className="filter-wrapper">
        <label htmlFor="filter-select">申請種別で絞り込み:</label>
        <select
          id="filter-select"
          className="filter-select"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">すべて</option>
          <option value="休日申請">休日申請</option>
          <option value="稟議申請">稟議申請</option>
        </select>
      </div>
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
              <div className="approver">
                <div>承認者1</div>
                <div className="approver-status-icon">
                  <span>
                    {approval.approver1Status === "承認待ち" && "⏳"}
                    {approval.approver1Status === "承認済み" && "✔️"}
                    {approval.approver1Status === "否決" && "❌"}
                  </span>
                  <span>{approval.approver1Name}</span>
                </div>
                <div>{approval.approver1Status}</div>
                <div>{approval.approver1Comment || "ー"}</div>
                {approval.approver1Status !== "承認待ち" && approval.approver1ApprovedAt && (
                  <div>
                    <strong>承認日時:</strong>
                    {new Date(approval.approver1ApprovedAt)
                      .toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                  </div>
                )}
                {approval.approver1Status === "承認待ち" && (
                  <div>
                    <button className="approve-btn">承認</button>
                    <button className="reject-btn">否決</button>
                  </div>
                )}
              </div>
              <div className="approver">
                <div>承認者2</div>
                <div className="approver-status-icon">
                  <span>
                    {approval.approver2Status === "承認待ち" && "⏳"}
                    {approval.approver2Status === "承認済み" && "✔️"}
                    {approval.approver2Status === "否決" && "❌"}
                  </span>
                  <span>{approval.approver2Name}</span>
                </div>
                <div>{approval.approver2Status}</div>
                <div>{approval.approver2Comment || "ー"}</div>
                {approval.approver2Status !== "承認待ち" && approval.approver2ApprovedAt && (
                  <div>
                    <strong>承認日時:</strong>
                    {new Date(approval.approver2ApprovedAt)
                      .toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                  </div>
                )}
                {approval.approver2Status === "承認待ち" && (
                  <div>
                    <button className="approve-btn">承認</button>
                    <button className="reject-btn">否決</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ApprovalManagementForm;