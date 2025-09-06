import React, { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';

// 金額を円表記にフォーマット。未入力は「（未入力）」を返す
const formatYen = (value: string | number | undefined | null): string => {
  if (value === undefined || value === null || value === '') return '（未入力）';
  const num = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
  if (Number.isNaN(num)) return '（未入力）';
  return `¥${num.toLocaleString('ja-JP')}`;
};

type Approver = {
  approverId: string;
  approverName: string;
  approverStatus: string;
  approverApprovedAt: string;
  approverComment: string;
};

type PersonalInfoRequest = {
  requestId: string;
  userId: string;
  displayName: string;
  departmentName: string;
  changeType: '住所変更' | '電話番号変更' | string;
  submittedAt: string;
  status?: string; // 'cancel' 等（あれば）
  // 住所変更用
  newAddress?: string;
  // 電話番号変更用
  newPhoneNumber?: string;
  // 通勤情報（任意・存在すれば表示）
  commuteInfo1?: string;
  commuteInfo2?: string;
  commuteInfo3?: string;
  commuteCostTotal?: string | number; // 往復合計
  approvers: Approver[];
};

const PersonalInfoPage = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PersonalInfoRequest[]>([]);
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
    fetch('https://q6as6ts76mdsywpueduew5lp7i0jkzpq.lambda-url.ap-northeast-1.on.aws/')
      .then((response) => response.json())
      .then((payload) => {
        const list = payload.personalInfoRequests || [];
        setData(list);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching data:', error);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    document.title = '個人情報変更一覧';
  }, []);

  if (loading) return <div>読み込み中...</div>;
  if (!data || data.length === 0) return <div>データなし</div>;

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

  const dateRange: [Date | null, Date | null] = [startDate, endDate];

  const filteredData = data.filter((item) => {
    if (dateRange[0] && dateRange[1]) {
      const fromDate = dayjs(dateRange[0]);
      const toDate = dayjs(dateRange[1]);
      const submitted = dayjs(item.submittedAt);
      if (
        !(
          submitted.isSame(fromDate, 'day') ||
          submitted.isSame(toDate, 'day') ||
          (submitted.isAfter(fromDate) && submitted.isBefore(toDate))
        )
      ) {
        return false;
      }
    }

    if (statusFilter) {
      const overallStatus = getOverallStatus(item.approvers);
      if (overallStatus !== statusFilter) return false;
    }

    return true;
  });

  // 申請日時（submittedAt）の降順
  const sortedData = [...filteredData].sort((a, b) => {
    const aTime = new Date(a.submittedAt || '').getTime();
    const bTime = new Date(b.submittedAt || '').getTime();
    return bTime - aTime;
  });

  const handleExportToExcel = () => {
    // すべての項目を網羅するヘッダー
    const headers = [
      '申請者',
      '所属',
      '変更種別',
      'ステータス',
      '申請日時',
      '新しい住所',
      '新しい電話番号',
      '通勤情報1',
      '通勤情報2',
      '通勤情報3',
      '通勤費合計金額(往復)',
    ];

    const exportData = sortedData.map((item) => {
      const overallStatus = getOverallStatus(item.approvers);
      return {
        '申請者': item.displayName ?? '',
        '所属': item.departmentName ?? '',
        '変更種別': item.changeType ?? '',
        'ステータス': item.status === 'cancel' ? '取消' : overallStatus,
        '申請日時': item.submittedAt ? dayjs(item.submittedAt).format('YYYY/MM/DD HH:mm') : '',
        '新しい住所': item.changeType === '住所変更' ? (item.newAddress ?? '') : '',
        '新しい電話番号': item.changeType === '電話番号変更' ? (item.newPhoneNumber ?? '') : '',
        '通勤情報1': item.commuteInfo1 ?? '',
        '通勤情報2': item.commuteInfo2 ?? '',
        '通勤情報3': item.commuteInfo3 ?? '',
        '通勤費合計金額(往復)': item.commuteCostTotal ?? '',
      };
    });

    const dataForSheet = exportData.map(row => {
      const ordered: any = {};
      headers.forEach(key => {
        ordered[key] = (row as Record<string, string | number | undefined>)[key] ?? '';
      });
      return ordered;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataForSheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '個人情報変更');
    XLSX.writeFile(workbook, '個人情報変更.xlsx');
  };

  return (
    <div className="approval-page rainbow-background">
      <h2 className="approval-title">個人情報変更一覧</h2>
      <button className="mermaid-button" onClick={handleExportToExcel}>
        🐚 エクセル出力
        <span className="bubbles"></span>
      </button>

      <div className="date-filter">
        <label>申請日時フィルター:</label>
        <DatePicker
          selected={startDate}
          onChange={(date: Date | null) => date && setStartDate(date)}
          selectsStart
          startDate={startDate}
          endDate={endDate}
          dateFormat="yyyy/MM/dd"
          placeholderText="開始日"
        />
        <span> ~ </span>
        <DatePicker
          selected={endDate}
          onChange={(date: Date | null) => date && setEndDate(date)}
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
        {sortedData.map((item) => (
          <div className={`approval-card ${item.status === 'cancel' ? 'cancelled' : ''}`} key={item.requestId}>
            {item.status === 'cancel' && <div className="cancel-overlay">cancel</div>}
            <div className="approval-header-top">
              <span className="badge">個人情報変更</span>
              <span className="approval-date">
                申請日時: {item.submittedAt ? new Date(item.submittedAt).toLocaleString('ja-JP') : ''}
              </span>
            </div>
            <div className="approval-body">
              <div><strong>申請者:</strong> {item.displayName}</div>
              <div><strong>所属:</strong> {item.departmentName}</div>
              <div><strong>変更種別:</strong> {item.changeType}</div>

              {item.changeType === '住所変更' ? (
                <>
                  <div><strong>新しい住所:</strong> {item.newAddress && item.newAddress.trim() ? item.newAddress : '（未入力）'}</div>
                  <div className="commute-section">
                    <div><strong>通勤経路:</strong></div>
                    <div>通勤情報1: {item.commuteInfo1 && item.commuteInfo1.trim() ? item.commuteInfo1 : '（なし）'}</div>
                    <div>通勤情報2: {item.commuteInfo2 && item.commuteInfo2.trim() ? item.commuteInfo2 : '（なし）'}</div>
                    <div>通勤情報3: {item.commuteInfo3 && item.commuteInfo3.trim() ? item.commuteInfo3 : '（なし）'}</div>
                    <div><strong>交通費（往復）合計:</strong> {formatYen(item.commuteCostTotal)}</div>
                  </div>
                </>
              ) : item.changeType === '電話番号変更' ? (
                <>
                  <div><strong>新しい電話番号:</strong> {item.newPhoneNumber || '（未入力）'}</div>
                </>
              ) : null}
            </div>

            <div className="approval-approvers">
              {item.approvers?.map((approver, index) => {
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

export default PersonalInfoPage;
