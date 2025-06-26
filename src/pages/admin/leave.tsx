import React, { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import * as XLSX from 'xlsx';

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

const mockData: LeaveRequest[] = [
  {
    requestId: 'e0904373-1f36-49f9-b033-887e72391715',
    userId: '1b69449b-65b8-4338-117e-04e754198156',
    displayName: '阿部　憲子（代理・池田祐介）',
    type: '有給',
    approvers: [
      {
        approverId: '1b69449b-65b8-4338-117e-04e754198156',
        approverName: '池田祐介',
        approverStatus: '承認',
        approverApprovedAt: '2025-06-20T02:25:50.834Z',
        approverComment: '',
      },
      {
        approverId: 'cd0ed664-cc27-4ae9-1a27-04910bf8223a',
        approverName: '岡奏子',
        approverStatus: '承認待ち',
        approverApprovedAt: '',
        approverComment: '',
      },
    ],
    days: 1,
    departmentName: '博多シーフード うお田',
    emergencyContact: '',
    endDate: '2025-06-23',
    note: '',
    startDate: '2025-06-23',
    status: 'pending',
    submittedAt: '2025-06-20T02:25:36.364Z',
    transferWorkDate: '',
    transferLeaveDate: '',
  },
  {
    requestId: 'req-2',
    userId: 'user-2',
    displayName: '佐藤 太郎',
    type: '振替',
    approvers: [
      {
        approverId: 'approver-3',
        approverName: '山田 花子',
        approverStatus: '承認',
        approverApprovedAt: '2025-06-19T09:00:00.000Z',
        approverComment: '了解しました。',
      },
      {
        approverId: 'approver-4',
        approverName: '田中 一郎',
        approverStatus: '承認待ち',
        approverApprovedAt: '',
        approverComment: '',
      },
    ],
    days: 1,
    departmentName: 'KITTE 博多',
    emergencyContact: '080-xxxx-xxxx',
    endDate: '',
    note: '私用のため',
    startDate: '',
    status: 'pending',
    submittedAt: '2025-06-19T21:00:00.000Z',
    transferWorkDate: '2025-06-25',
    transferLeaveDate: '2025-06-26',
  },
];

const LeavePage = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LeaveRequest[]>([]);
  const [filterDate, setFilterDate] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  useEffect(() => {
    // Simulate fetching data
    setTimeout(() => {
      setData(mockData);
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) {
    return <div>読み込み中...</div>;
  }

  if (data.length === 0) {
    return <div>データなし</div>;
  }

  // 新しいフィルターロジック
  const filterStartDate = startDate ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()) : null;
  const filterEndDate = endDate
    ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1)
    : null;
  const filteredData = data.filter((leave) => {
    const leaveStart = new Date(leave.startDate);
    const leaveEnd = new Date(leave.endDate);
    const isSubstitute = leave.type === '振替';

    // フィルターが指定されていない場合は全件表示
    if (!filterStartDate || !filterEndDate) return true;

    if (isSubstitute) {
      // 振替休日の場合は transferLeaveDate がフィルター範囲内に含まれるか確認
      // transferLeaveDateが空文字の場合は除外
      if (!leave.transferLeaveDate) return false;
      const substituteDate = new Date(leave.transferLeaveDate);
      return substituteDate >= filterStartDate && substituteDate <= filterEndDate;
    } else {
      // 通常の休暇は申請期間がフィルター範囲と重なるかを判定
      return (
        leaveStart <= filterEndDate &&
        leaveEnd >= filterStartDate
      );
    }
  });

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

    const exportData = filteredData.map((item) => {
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

  return (
    <div className="approval-page rainbow-background">
      <h2 className="approval-title">休暇申請一覧</h2>
      <button onClick={handleExportToExcel}>Excelに出力</button>
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
    </div>
  );
};

export default LeavePage;