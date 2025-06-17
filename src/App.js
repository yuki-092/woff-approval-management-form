import React from 'react';
import AdminTopPage from './pages/admin/AdminTopPage';
import LeaveListPage from './pages/admin/LeaveListPage';
import RingiListPage from './pages/admin/RingiListPage';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import ApprovalManagementForm from './pages/ApprovalManagementForm';
import CompletePage from './pages/CompletePage';

function App() {
  return (
    <Router>
      <div>
        <Routes>
          <Route path="/" element={<ApprovalManagementForm />} />
          <Route path="/complete" element={<CompletePage />} />
          <Route path="/admin" element={<AdminTopPage />} />
          <Route path="/admin/leave" element={<LeaveListPage />} />
          <Route path="/admin/ringi" element={<RingiListPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;