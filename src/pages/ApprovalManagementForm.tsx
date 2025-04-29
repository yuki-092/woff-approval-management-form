import React, { useState, useEffect } from "react";

type ApprovalStatus = {
  approver: string;
  status: "承認済み" | "承認待ち" | "否決";
  comment?: string;
};

type ApprovalData = {
  requestId: string;
  submittedAt: string;
  startDate: string;
  endDate: string;
  type: string;
  approvals: ApprovalStatus[];
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
        setApprovals(data.items);
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
        {filteredApprovals.map((approval) => (
          <div key={approval.requestId} className="approval-card">
            <div className="approval-header">
              <span className="badge">{approval.type}</span>
              <span className="approval-date">{approval.submittedAt}</span>
            </div>
            <div className="approval-body">
              <div>期間: {approval.startDate} 〜 {approval.endDate}</div>
              <div className="approval-approvers">
                {approval.approvals.map((a, index) => (
                  <div key={index} className={`approver-status ${a.status}`}>
                    {a.approver}: {a.status}
                    {a.status === "否決" && a.comment && (
                      <div className="rejection-comment">コメント: {a.comment}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ApprovalManagementForm;