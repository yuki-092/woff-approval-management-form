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

// 通勤情報の簡易パーサー（「手段・区間・料金」を推定表示）
type ParsedCommute = {
  mode?: string;   // 徒歩/電車/バス/地下鉄/JR/新幹線/自転車/車 等
  section?: string; // 区間（例: 美野島 → 博多駅）
  fare?: number | null; // 料金（片道/往復の明記は元文字列に依存）
  raw: string;     // 元文字列（パースできない場合のフォールバック表示）
};

const parseCommuteInfo = (input?: string | null): ParsedCommute | null => {
  if (!input) return null;
  const cleaned = String(input).trim();
  if (!cleaned) return null;

  // 手段候補を抽出
  const modeMatch = cleaned.match(/(徒歩|電車|バス|地下鉄|JR|新幹線|自転車|車)/);
  const mode = modeMatch ? modeMatch[1] : undefined;

  // 「→ / ->」や区切り記号で区間を推定
  let section: string | undefined = undefined;
  const arrow = cleaned.match(/([^→\-]+?)(?:\s*(?:→|->)\s*)(.+)/);
  if (arrow) {
    section = `${arrow[1].trim()} → ${arrow[2].trim()}`;
  } else {
    const parts = cleaned.split(/[|｜,/／]/).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      // 先頭要素が手段なら2番目を区間に採用
      section = parts[0].match(/(徒歩|電車|バス|地下鉄|JR|新幹線|自転車|車)/) ? parts[1] : parts[0];
    }
  }

  // 金額（最初に現れる数値）を抽出
  const fareMatch = cleaned.match(/([¥￥]?\s*\d[\d,]*)/);
  const fare = fareMatch ? Number(fareMatch[1].replace(/[^\d]/g, '')) : null;

  return { mode, section, fare, raw: cleaned };
};

const renderCommuteRow = (label: string, value?: string | null) => {
  const parsed = parseCommuteInfo(value);
  if (!parsed) {
    return (
      <tr className="commute-row">
        <td className="commute-col-label">{label}</td>
        <td className="commute-col-mode">（なし）</td>
        <td className="commute-col-section">—</td>
        <td className="commute-col-fare">—</td>
      </tr>
    );
  }
  return (
    <tr className="commute-row">
      <td className="commute-col-label">{label}</td>
      <td className="commute-col-mode">{parsed.mode ?? '—'}</td>
      <td className="commute-col-section">{parsed.section ?? parsed.raw}</td>
      <td className="commute-col-fare">{parsed.fare != null ? `¥${parsed.fare.toLocaleString('ja-JP')}` : '—'}</td>
    </tr>
  );
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
  changeType: '住所' | '電話' | string;
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
  commuteInfos?: string[]; // 新フォーマット（配列）
  commutes?: string[];     // 受信データがこのキーの場合にも対応
  commuteCostTotal?: string | number; // 往復合計
  totalFare?: string | number; // APIによっては totalFare 名で来る
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
      const rawList = Array.isArray((item as any).commuteInfos)
        ? (item as any).commuteInfos
        : (Array.isArray((item as any).commutes) ? (item as any).commutes : [item.commuteInfo1, item.commuteInfo2, item.commuteInfo3]);
      const commuteList = (rawList || []).filter((v: any) => typeof v === 'string' && v.trim().length > 0);
      return {
        '申請者': item.displayName ?? '',
        '所属': item.departmentName ?? '',
        '変更種別': item.changeType ?? '',
        'ステータス': item.status === 'cancel' ? '取消' : overallStatus,
        '申請日時': item.submittedAt ? dayjs(item.submittedAt).format('YYYY/MM/DD HH:mm') : '',
        '新しい住所': item.changeType === '住所' ? (item.newAddress ?? '') : '',
        '新しい電話番号': item.changeType === '電話' ? (item.newPhoneNumber ?? '') : '',
        '通勤情報1': commuteList[0] ?? '',
        '通勤情報2': commuteList[1] ?? '',
        '通勤情報3': commuteList[2] ?? '',
        '通勤費合計金額(往復)': (item.commuteCostTotal ?? (item as any).totalFare) ?? '',
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

              {item.changeType === '住所' ? (
                <>
                  <div><strong>新しい住所:</strong> {item.newAddress && item.newAddress.trim() ? item.newAddress : '（未入力）'}</div>
                  <div className="commute-section">
                    <div className="commute-title"><strong>通勤経路</strong></div>
                    <table className="commute-table" role="table">
                      <thead>
                        <tr>
                          <th className="commute-col-label">経路</th>
                          <th className="commute-col-mode">手段</th>
                          <th className="commute-col-section">区間</th>
                          <th className="commute-col-fare">料金</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const rawList = Array.isArray((item as any).commuteInfos)
                            ? (item as any).commuteInfos
                            : (Array.isArray((item as any).commutes) ? (item as any).commutes : [item.commuteInfo1, item.commuteInfo2, item.commuteInfo3]);
                          const commuteList = (rawList || []).filter((v: any) => typeof v === 'string' && v.trim().length > 0);
                          return commuteList.length > 0
                            ? commuteList.map((info: string, index: number) => renderCommuteRow(`経路${index + 1}`, info))
                            : renderCommuteRow('経路1', null);
                        })()}
                      </tbody>
                    </table>
                    <div className="commute-total"><strong>交通費（往復）合計:</strong> {formatYen(item.commuteCostTotal ?? (item as any).totalFare)}</div>
                  </div>
                </>
              ) : item.changeType === '電話' ? (
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
