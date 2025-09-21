import React, { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';

const APPROVAL_ENDPOINT = process.env.NEXT_PUBLIC_APPROVAL_ENDPOINT || 'https://zrhl6xn4r4z2crfbb34pq5zohe0hdxgd.lambda-url.ap-northeast-1.on.aws/';

// 金額を円表記にフォーマット。未入力は「（未入力）」を返す
const formatYen = (value: string | number | undefined | null): string => {
  if (value === undefined || value === null || value === '') return '（未入力）';
  const num = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
  if (Number.isNaN(num)) return '（未入力）';
  return `¥${num.toLocaleString('ja-JP')}`;
};

// 空や0は「0円」で表記する（合計金額用）
const formatYenZero = (value: any): string => {
  if (value === undefined || value === null || value === '') return '0円';
  const num = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
  if (Number.isNaN(num) || num === 0) return '0円';
  return `¥${num.toLocaleString('ja-JP')}`;
};

type Approver = {
  approverId: string;
  approverName: string;
  approverStatus: string;
  approverApprovedAt: string;
  approverComment: string;
};

type Commute = {
  method: string;
  route: string;
  fareRoundTrip: number; // 往復金額（数値）
};

type PersonalInfoRequest = {
  requestId: string;
  userId: string;
  displayName: string;
  departmentName: string;
  changeType: '住所' | '電話' | string;
  submittedAt: string;
  status?: string; // 'cancel' 等
  newAddress?: string;
  newPhoneNumber?: string;
  commutes?: Commute[];
  commuteCostTotal?: number;
  totalFare?: number;
  approvers: Approver[];
};

const PersonalInfoPage = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PersonalInfoRequest[]>([]);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [comments, setComments] = useState<Record<string, string>>({});

  const handleApprove = async (requestId: string, comment: string = '') => {
    try {
      const target = data.find(d => d.requestId === requestId);
      if (!target) return alert('対象データが見つかりません');

      const payload = {
        requestId: target.requestId,
        userId: target.userId,
        displayName: target.displayName,
        type: '個人情報変更',
        status: '承認',
        approverComment: comment
      };
      console.log('POST approve:', payload);

      const res = await fetch(APPROVAL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`承認に失敗しました: ${res.status} ${txt}`);
      }

      // 楽観更新: 最初のPENDINGをAPPROVEDに
      setData(prev => prev.map(it => {
        if (it.requestId !== requestId) return it;
        const idx = (it.approvers || []).findIndex(a => a.approverStatus === 'PENDING' || a.approverStatus === '承認待ち');
        if (idx === -1) return it;
        const next = [...it.approvers];
        next[idx] = { ...next[idx], approverStatus: 'APPROVED', approverApprovedAt: new Date().toISOString(), approverComment: comment } as any;
        return { ...it, approvers: next };
      }));
      alert('承認しました');
    } catch (e: any) {
      console.error(e);
      alert(e?.message || '承認に失敗しました');
    }
  };

  const handleReject = async (requestId: string, comment: string = '') => {
    try {
      const target = data.find(d => d.requestId === requestId);
      if (!target) return alert('対象データが見つかりません');

      const payload = {
        requestId: target.requestId,
        userId: target.userId,
        displayName: target.displayName,
        type: '個人情報変更',
        status: '否決',
        approverComment: comment
      };
      console.log('POST reject:', payload);

      const res = await fetch(APPROVAL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`否決に失敗しました: ${res.status} ${txt}`);
      }

      // 楽観更新: 最初のPENDINGをREJECTEDに
      setData(prev => prev.map(it => {
        if (it.requestId !== requestId) return it;
        const idx = (it.approvers || []).findIndex(a => a.approverStatus === 'PENDING' || a.approverStatus === '承認待ち');
        if (idx === -1) return it;
        const next = [...it.approvers];
        next[idx] = { ...next[idx], approverStatus: 'REJECTED', approverApprovedAt: new Date().toISOString(), approverComment: comment } as any;
        return { ...it, approvers: next };
      }));
      alert('否決しました');
    } catch (e: any) {
      console.error(e);
      alert(e?.message || '否決に失敗しました');
    }
  };

  const getOverallStatus = (approvers: Approver[]): string => {
    const normalizeStatus = (s: string) => {
      switch (s) {
        case 'PENDING': return '承認待ち';
        case 'APPROVED': return '承認';
        case 'REJECTED': return '否決';
        default: return s;
      }
    };
    const statuses = approvers.map(a => normalizeStatus(a.approverStatus));
    if (statuses.includes('否決')) return '否決';
    if (statuses.includes('承認待ち')) return '承認待ち';
    if (statuses.every(s => s === '承認')) return '承認';
    return 'その他';
  };

  const getStatusTextAndClass = (status: string) => {
    switch (status) {
      case '承認': return { text: '承認済み', className: 'status-approved' };
      case '承認待ち': return { text: '未承認', className: 'status-pending' };
      case '否決': return { text: '否決', className: 'status-rejected' };
      default: return { text: status, className: '' };
    }
  };

  const isPhoneChange = (v?: string) => {
    if (!v) return false;
    const s = v.trim();
    return s === '電話' || s === '電話番号' || s === '電話番号変更' || s === '電話変更' || s === 'TEL' || s === '電話番号の変更';
  };

  const getChangeLabel = (changeType?: string) => {
    if (!changeType) return '個人情報変更';
    if (isPhoneChange(changeType)) return '電話番号変更';
    if (changeType.trim() === '住所') return '住所変更';
    return '個人情報変更';
  };

  useEffect(() => {
    fetch('https://q6as6ts76mdsywpueduew5lp7i0jkzpq.lambda-url.ap-northeast-1.on.aws/')
      .then((res) => res.json())
      .then((payload) => {
        const list = payload.personalInfoRequests || [];
        setData(list);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching data:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    document.title = '個人情報変更一覧';
  }, []);

  if (loading) return <div>読み込み中...</div>;
  if (!data || data.length === 0) return <div>データなし</div>;

  const dateRange: [Date | null, Date | null] = [startDate, endDate];

  const filteredData = data.filter((item) => {
    if (dateRange[0] && dateRange[1]) {
      const fromDate = dayjs(dateRange[0]);
      const toDate = dayjs(dateRange[1]);
      const submitted = dayjs(item.submittedAt);
      if (!(submitted.isSame(fromDate, 'day') || submitted.isSame(toDate, 'day') || (submitted.isAfter(fromDate) && submitted.isBefore(toDate)))) {
        return false;
      }
    }
    if (statusFilter) {
      const overallStatus = getOverallStatus(item.approvers);
      if (overallStatus !== statusFilter) return false;
    }
    return true;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    const aTime = new Date(a.submittedAt || '').getTime();
    const bTime = new Date(b.submittedAt || '').getTime();
    return bTime - aTime;
  });

  const handleExportToExcel = () => {
    const headers = ['申請者','所属','ステータス','申請日時','新しい住所','新しい電話番号','通勤経路','通勤費合計金額(往復)'];
    const exportData = sortedData.map((item) => {
      const overallStatus = getOverallStatus(item.approvers);
      const commutesStr = (item.commutes ?? []).map((c, i) => `経路${i + 1}, ${c.method}, ${c.route}, ${c.fareRoundTrip}`).join(' / ');
      return {
        '申請者': item.displayName ?? '',
        '所属': item.departmentName ?? '',
        'ステータス': item.status === 'cancel' ? '取消' : overallStatus,
        '申請日時': item.submittedAt ? dayjs(item.submittedAt).format('YYYY/MM/DD HH:mm') : '',
        '新しい住所': item.changeType === '住所' ? (item.newAddress ?? '') : '',
        '新しい電話番号': isPhoneChange(item.changeType) ? (item.newPhoneNumber ?? '') : '',
        '通勤経路': commutesStr,
        '通勤費合計金額(往復)': formatYenZero(item.commuteCostTotal ?? item.totalFare),
      };
    });
    const dataForSheet = exportData.map(row => {
      const ordered: any = {}; headers.forEach(key => { ordered[key] = (row as any)[key] ?? ''; }); return ordered;
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
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
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
              <span className="badge">{getChangeLabel(item.changeType)}</span>
              <span className="approval-date">申請日時: {item.submittedAt ? new Date(item.submittedAt).toLocaleString('ja-JP') : ''}</span>
            </div>

            <div className="approval-body">
              <div><strong>申請者:</strong> {item.displayName}</div>
              <div><strong>所属:</strong> {item.departmentName}</div>

              {item.changeType === '住所' ? (
                <>
                  <div><strong>新しい住所:</strong> {item.newAddress && item.newAddress.trim() ? item.newAddress : '（未入力）'}</div>
                  {item.newPhoneNumber && (<div className="phone-inline-note"><strong>（参考）新しい電話番号:</strong> {item.newPhoneNumber}</div>)}
                  <div className="commute-section">
                    <div className="commute-title"><strong>通勤経路</strong></div>
                    <div className="commute-lines">
                      {item.commutes && item.commutes.length > 0 ? (
                        item.commutes.map((c, idx) => (
                          <div key={idx} className="commute-line">
                            {`経路${idx + 1}, ${c.method || '—'}, ${c.route || '—'}, ${Number.isFinite(c.fareRoundTrip) ? `¥${c.fareRoundTrip.toLocaleString('ja-JP')}` : '—'}`}
                          </div>
                        ))
                      ) : (
                        <div className="commute-line">経路1, （なし）, —, —</div>
                      )}
                    </div>
                    <div className="commute-total"><strong>交通費（往復）合計:</strong> {formatYenZero(item.commuteCostTotal ?? item.totalFare)}</div>
                  </div>
                </>
              ) : isPhoneChange(item.changeType) ? (
                <div><strong>新しい電話番号:</strong> {item.newPhoneNumber || '（未入力）'}</div>
              ) : null}
            </div>

            <div className="approval-approvers">
              {item.approvers?.map((approver, index) => {
                const normalized =
                  approver.approverStatus === 'PENDING' ? '承認待ち' :
                  approver.approverStatus === 'APPROVED' ? '承認' :
                  approver.approverStatus === 'REJECTED' ? '否決' :
                  approver.approverStatus;
                const { text, className } = getStatusTextAndClass(normalized);
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

            {/* 承認パネル */}
            <div className="approver-panel">
              <div className="approver-title">承認者1</div>
              <div className="approver-row">
                <span className="approver-icon">⏳</span>
                <span className="approver-name">{(item as any).approver1Name || (item.approvers?.[0]?.approverName ?? '—')}</span>
              </div>
              <div className="approver-status">承認待ち</div>

              <label className="comment-label" htmlFor={`comment-${item.requestId}`}>コメント（任意）</label>
              <textarea
                id={`comment-${item.requestId}`}
                className="comment-textarea"
                placeholder="コメント（任意）"
                value={comments[item.requestId] || ''}
                onChange={(e) => setComments(prev => ({ ...prev, [item.requestId]: e.target.value }))}
              />

              <div className="approval-actions">
                <button type="button" className="btn btn-reject" onClick={() => handleReject(item.requestId, comments[item.requestId] || '')}>否決</button>
                <button type="button" className="btn btn-approve" onClick={() => handleApprove(item.requestId, comments[item.requestId] || '')}>承認</button>
              </div>
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