

import React from 'react';
import { useNavigate } from 'react-router-dom';

const AdminTopPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="admin-top-page">
      <h1>管理者画面</h1>
      <div className="admin-top-buttons">
        <button
          onClick={() => navigate('/admin/leave')}
          className="admin-top-button"
        >
          休暇申請一覧
        </button>
        <button
          onClick={() => navigate('/admin/ringi')}
          className="admin-top-button"
        >
          稟議申請一覧
        </button>
      </div>
    </div>
  );
};

export default AdminTopPage;