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

  useEffect(() => {
    fetch('https://4ub5nmvxbpfxlizulqovd7o5xy0nwuvg.lambda-url.ap-northeast-1.on.aws/')
      .then((response) => response.json())
      .then((data) => {
        setData(data);
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

    const exportData = data.map((item) => {
      return {
        '申請者': item.displayName,
        '所属': item.departmentName,
        '申請する休日': item.type,
        '申請期間（自）': item.startDate ?? '',
        '申請期間（至）': item.endDate ?? '',
        '申請日数': item.days ?? '',
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
    if (!dateRange[0] || !dateRange[1]) return true;
    const fromDate = dayjs(dateRange[0]);
    const toDate = dayjs(dateRange[1]);

    if (item.type === "振替") {
      const furikaeDate = dayjs(item.transferLeaveDate);
      return (
        furikaeDate.isSame(fromDate, "day") ||
        furikaeDate.isSame(toDate, "day") ||
        (furikaeDate.isAfter(fromDate) && furikaeDate.isBefore(toDate))
      );
    } else {
      const startDate = dayjs(item.startDate);
      const endDate = dayjs(item.endDate);
      return (
        startDate.isSame(fromDate, "day") ||
        startDate.isSame(toDate, "day") ||
        (startDate.isAfter(fromDate) && startDate.isBefore(toDate)) ||
        endDate.isSame(fromDate, "day") ||
        endDate.isSame(toDate, "day") ||
        (endDate.isAfter(fromDate) && endDate.isBefore(toDate))
      );
    }
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