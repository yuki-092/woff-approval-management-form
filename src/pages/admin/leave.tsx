import React, { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';

type Approver = {
  approverId: string;
  approverName: string;
  approverStatus: string;
  approverApprovedAt: string;
  approverComment: string;
};

type LeaveRequest = {
  requestId: string;
  userId: string;
  displayName: string;
  type: string;
  approvers: Approver[];
  days: number;
  departmentName: string;
  emergencyContact: string;
  endDate: string;
  note: string;
  startDate: string;
  status: string;
  submittedAt: string;
  transferWorkDate: string;
  transferLeaveDate: string;
  transferDate?: string; // Added optional transferDate for filtering
};

const LeavePage = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LeaveRequest[]>([]);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const getOverallStatus = (approvers: Approver[]): string => {
    const statuses = approvers.map(a => a.approverStatus);
    if (statuses.includes('否決')) return '否決';
    if (statuses.includes('承認待ち')) return '承認待ち';
    if (statuses.every(s => s === '承認')) return '承認';
    return 'その他';
  };

  useEffect(() => {
    fetch('https://4ub5nmvxbpfxlizulqovd7o5xy0nwuvg.lambda-url.ap-northeast-1.on.aws/')
      .then((response) => response.json())
      .then((data) => {
        setData(data.leaveRequests);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching data:', error);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div>読み込み中...</div>;
  }

  if (data.length === 0) {
    return <div>データなし</div>;
  }

  const getStatusTextAndClass = (status: string) => {
    switch (status) {
      case '承認':
        return { text: '承認済み', className: 'status-approved' };
      case '承認待ち':
        return { text: '未承認', className: 'status-pending' };
      case '否決':
        return { text: '否決', className: 'status-rejected' };
      default:
        return { text: status, className: '' };
    }
  };

  const handleExportToExcel = () => {
    const headers = [
      '申請者',
      '所属',
      '申請する休日',
      '申請期間（自）',
      '申請期間（至）',
      '申請日数',
      '振替対象日',
      '振替休暇取得日',
      '備考',
    ];

    const exportTarget = startDate && endDate ? filteredData : data;

    const exportData = exportTarget.map((item) => {
      const isFurikae = item.type === '振替';
      return {
        '申請者': item.displayName,
        '所属': item.departmentName,
        '申請する休日': item.type,
        '申請期間（自）': item.startDate ?? '',
        '申請期間（至）': item.endDate ?? '',
        '申請日数': isFurikae ? '' : item.days ?? '',
        '振替対象日': item.transferWorkDate ?? '',
        '振替休暇取得日': item.transferLeaveDate ?? '',
        '備考': item.note ?? '',
      };
    });

    // ヘッダー順に並べ替えたオブジェクトの配列を作成
    const dataForSheet = exportData.map(row => {
      const ordered: any = {};
      headers.forEach(key => {
        ordered[key] = (row as Record<string, string | number | undefined>)[key] ?? '';
      });
      return ordered;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataForSheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '休暇申請');
    XLSX.writeFile(workbook, '休暇申請.xlsx');
  };

  const dateRange: [Date | null, Date | null] = [startDate, endDate];
  const filteredData = data.filter((item) => {
    // 日付フィルター適用（存在する場合のみ）
    if (dateRange[0] && dateRange[1]) {
      const fromDate = dayjs(dateRange[0]);
      const toDate = dayjs(dateRange[1]);

      if (item.type === "振替") {
        const furikaeDate = dayjs(item.transferLeaveDate);
        if (
          !(
            furikaeDate.isSame(fromDate, "day") ||
            furikaeDate.isSame(toDate, "day") ||
            (furikaeDate.isAfter(fromDate) && furikaeDate.isBefore(toDate))
          )
        ) {
          return false;
        }
      } else {
        const sDate = dayjs(item.startDate);
        const eDate = dayjs(item.endDate);
        if (
          !(
            sDate.isSame(fromDate, "day") ||
            sDate.isSame(toDate, "day") ||
            (sDate.isAfter(fromDate) && sDate.isBefore(toDate)) ||
            eDate.isSame(fromDate, "day") ||
            eDate.isSame(toDate, "day") ||
            (eDate.isAfter(fromDate) && eDate.isBefore(toDate))
          )
        ) {
          return false;
        }
      }
    }

    // ステータスフィルター適用（指定されている場合のみ）
    if (statusFilter) {
      const overallStatus = getOverallStatus(item.approvers);
      if (overallStatus !== statusFilter) return false;
    }

    return true;
  });

  return (
    <div className="approval-page rainbow-background">
      <h2 className="approval-title">休暇申請一覧</h2>
      <button className="mermaid-button" onClick={handleExportToExcel}>
        🐚 エクセル出力
        <span className="bubbles"></span>
      </button>
      <div className="date-filter">
        <label>休暇日時フィルター:</label>
        <DatePicker
          selected={startDate}
          onChange={(date: Date | null) => {
            if (date) setStartDate(date);
          }}
          selectsStart
          startDate={startDate}
          endDate={endDate}
          dateFormat="yyyy/MM/dd"
          placeholderText="開始日"
        />
        <span> ~ </span>
        <DatePicker
          selected={endDate}
          onChange={(date: Date | null) => {
            if (date) setEndDate(date);
          }}
          selectsEnd
          startDate={startDate}
          endDate={endDate}
          dateFormat="yyyy/MM/dd"
          placeholderText="終了日"
        />
      </div>
      <div className="status-filter">
        <label>申請状況フィルター:</label>
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">すべて</option>
          <option value="承認">承認</option>
          <option value="承認待ち">未承認</option>
          <option value="否決">否決</option>
        </select>
      </div>
      <div className="approval-list">
        {filteredData.map((item) => (
          <div className="approval-card" key={item.requestId}>
            <div className="approval-header-top">
              <span className="badge">休暇申請</span>
              <span className="approval-date">申請日時: {new Date(item.submittedAt).toLocaleString('ja-JP')}</span>
            </div>
            <div className="approval-body">
              {item.type === '振替' ? (
                <>
                  <div><strong>申請者:</strong> {item.displayName}</div>
                  <div><strong>所属:</strong> {item.departmentName}</div>
                  <div><strong>申請する休日:</strong> 振替</div>
                  <div><strong>振替対象日:</strong> {item.transferWorkDate}</div>
                  <div><strong>振替休暇取得希望日:</strong> {item.transferLeaveDate}</div>
                  <div><strong>備考:</strong> {item.note || '（なし）'}</div>
                </>
              ) : (
                <>
                  <div><strong>申請者:</strong> {item.displayName}</div>
                  <div><strong>所属:</strong> {item.departmentName}</div>
                  <div><strong>申請する休日:</strong> {item.type}</div>
                  <div><strong>申請期間:</strong> {item.startDate} 〜 {item.endDate || '未定'}</div>
                  <div><strong>日数:</strong> {item.days} 日</div>
                  <div><strong>備考:</strong> {item.note || '（なし）'}</div>
                </>
              )}
            </div>
            <div className="approval-approvers">
              {item.approvers.map((approver, index) => {
                const { text, className } = getStatusTextAndClass(approver.approverStatus);
                return (
                  <div className="approver" key={index}>
                    <div><strong>承認者{index + 1}:</strong> {approver.approverName}</div>
                    <div className={className}>{text}</div>
                    {approver.approverStatus === '承認' && approver.approverApprovedAt && (
                      <div className="approver-date">承認日時: {new Date(approver.approverApprovedAt).toLocaleString('ja-JP')}</div>
                    )}
                    {approver.approverComment && (
                      <div><strong>コメント:</strong> {approver.approverComment}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mermaid-container">
        <img src="/mermaid.png" className="mermaid-icon floating" alt="mermaid" />
      </div>
      <img src="/mermaid.png" alt="Mermaid" className="swimming-mermaid" />
    </div>
  );
};

export default LeavePage;