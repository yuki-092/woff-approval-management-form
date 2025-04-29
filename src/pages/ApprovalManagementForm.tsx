// src/pages/MyApprovals.tsx
import React, { useEffect, useState } from "react";

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

const dummyData: ApprovalData[] = [
  {
    requestId: "REQ123",
    submittedAt: "2025-04-28",
    startDate: "2025-05-01",
    endDate: "2025-05-03",
    type: "休日申請",
    approvals: [
      { approver: "上司", status: "承認済み" },
      { approver: "人事部", status: "承認待ち" },
    ],
  },
  {
    requestId: "REQ124",
    submittedAt: "2025-04-26",
    startDate: "2025-05-05",
    endDate: "2025-05-06",
    type: "稟議申請",
    approvals: [
      { approver: "上司", status: "承認済み" },
      { approver: "部門長", status: "否決", comment: "予算超過のため却下しました" },
      { approver: "役員", status: "承認待ち" },
    ],
  },
];

export const ApprovalManagementForm = () => {
  const [approvals, setApprovals] = useState<ApprovalData[]>([]);  // 型引数を追加
  const [filterType, setFilterType] = useState("");  // 正しく修正

  useEffect(() => {
    setApprovals(dummyData);
  }, []);

  const filteredApprovals = filterType
    ? approvals.filter((approval) => approval.type === filterType)
    : approvals;

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