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
  content?: string;
  userId: string;
  amount?: number;
  attachmentFiles?: { fileName: string; fileUrl: string }[];
  otherAttachmentFiles?: { fileName: string; fileUrl: string }[];
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
        const transformedApprovals = [
          ...(data.leaveRequests?.items || []),
          ...(data.ringiRequests?.items || [])
        ]
          .map((item: any) => {
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
        console.log("Transformed Approvals:", transformedApprovals);
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
  console.log("Filtered Approvals:", filteredApprovals);

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
        {filteredApprovals && filteredApprovals.length > 0 ? (
          filteredApprovals.map((approval) => (
            <ApprovalItem key={approval.requestId} approval={approval} onApproveReject={handleApprovalReject} />
          ))
        ) : (
          <p>未承認リストはありません。</p>
        )}
      </div>
    </div>
  );
};

type ApprovalItemProps = {
  approval: ApprovalData;
  onApproveReject: (approvalData: any) => void;
};

const ApprovalItem: React.FC<ApprovalItemProps> = ({ approval, onApproveReject }) => {
  // 各承認者のコメントを保持するstateを定義
  const [comments, setComments] = useState<{ [key: number]: string }>({});

  const handleCommentChange = (index: number, value: string) => {
    setComments((prev) => ({
      ...prev,
      [index]: value, // 指定したindexのコメントを更新
    }));
  };

  return (
    <div className="approval-card">
      <div className="approval-header">
        <div className="approval-header-top">
          <span className="badge">
            {approval.type}
          </span>
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
        {approval.type === "休暇申請" ? (
          <>
            <div>
              <strong>申請者:</strong> {approval.displayName}
            </div>
            <div>
              <strong>申請する休日:</strong> {approval.type}
            </div>
            <div>
              <strong>申請期間:</strong> {approval.startDate} 〜 {approval.endDate}
            </div>
            <div>
              <strong>申請日数:</strong> {approval.days} 日
            </div>
            <div>
              <strong>内容:</strong> {approval.note}
            </div>
          </>
        ) : approval.type === "稟議申請" ? (
          <>
            <div>
              <strong>申請者:</strong> {approval.displayName}
            </div>
            <div>
              <strong>内容:</strong> {approval.content}
            </div>
            <div>
              <strong>金額:</strong> {approval.amount}
            </div>
            <div>
              <strong>添付ファイル:</strong>
              {approval.attachmentFiles?.map(file => (
                <div key={file.fileUrl}>
                  <a href={file.fileUrl} target="_blank" rel="noopener noreferrer">{file.fileName}</a>
                </div>
              ))}
            </div>
            <div>
              <strong>その他添付ファイル:</strong>
              {approval.otherAttachmentFiles?.map(file => (
                <div key={file.fileUrl}>
                  <a href={file.fileUrl} target="_blank" rel="noopener noreferrer">{file.fileName}</a>
                </div>
              ))}
            </div>
          </>
        ) : null}
        {approval.approvers.map((approver, index) => (
          <div key={`${index}-${approver.approverId}`} className="approver">
            <div>
              <strong>承認者{index + 1}</strong>
            </div>
            <div className="approver-status-icon">
              <span>
                {approver.approverStatus === "承認待ち" && "⏳"}
                {approver.approverStatus === "承認" && "✔️"}
                {approver.approverStatus === "否決" && "❌"}
              </span>
              <span>{approver.approverName}</span>
            </div>
            <div className="approver-status">{approver.approverStatus}</div>
            {approver.approverStatus === "承認" && (
              <div>{approver.approverComment || "コメントなし"}</div>
            )}
            {approver.approverStatus !== "承認待ち" && approver.approverApprovedAt && (
              <div>
                <strong>承認日時:</strong>
                {new Date(approver.approverApprovedAt)
                  .toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
              </div>
            )}
            {approver.approverStatus === "承認待ち" && (
              <>
                <div className="comment-input-container">
                  <textarea
                    id={`approver-comment-${index}`}
                    placeholder="コメント（任意）"
                    value={comments[index] || ""} // 対応する承認者のコメントを表示
                    onChange={(e) => handleCommentChange(index, e.target.value)} // コメントを更新
                    rows={4}
                  />
                </div>
                <div className="approval-buttons">
                  <button
                    className="reject-btn"
                    onClick={() => onApproveReject({
                      requestId: approval.requestId,
                      approverNumber: index + 1,
                      approverName: approver.approverName,
                      nextApproverId: approval.approvers[index + 1]?.approverId,
                      status: "否決",
                      userId: approval.userId,
                      displayName: approval.displayName,
                      type: approval.type,
                      approverComment: comments[index] || "", // 各承認者のコメントを送信
                    })}
                  >
                    否決
                  </button>
                  <button
                    className="approve-btn"
                    onClick={() => onApproveReject({
                      requestId: approval.requestId,
                      approverNumber: index + 1,
                      approverName: approver.approverName,
                      nextApproverId: approval.approvers[index + 1]?.approverId,
                      status: "承認",
                      userId: approval.userId,
                      displayName: approval.displayName,
                      type: approval.type,
                      approverComment: comments[index] || "", // 各承認者のコメントを送信
                    })}
                  >
                    承認
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ApprovalManagementForm;