

import React, { useEffect, useState } from 'react';

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
    type: '代休',
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
    endDate: '2025-06-25',
    note: '私用のため',
    startDate: '2025-06-25',
    status: 'pending',
    submittedAt: '2025-06-19T21:00:00.000Z',
    transferWorkDate: '',
    transferLeaveDate: '',
  },
];

const LeavePage = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LeaveRequest[]>([]);

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

  return (
    <div>
      <h2>休暇申請一覧</h2>
      {data.map((item) => (
        <div key={item.requestId} className="leave-card">
          <h3>{item.displayName}</h3>
          <p>申請タイプ: {item.type}</p>
          <p>期間: {item.startDate} 〜 {item.endDate}</p>
          <p>所属: {item.departmentName}</p>
          <p>ステータス: {item.status}</p>
        </div>
      ))}
    </div>
  );
};

export default LeavePage;