import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ApprovalManagementForm from './pages/ApprovalManagementForm';
import AdminTopPage from './pages/admin/AdminTopPage';
import LeavePage from './pages/admin/leave';
import PersonalInfoPage from './pages/admin/personal-info';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ApprovalManagementForm />} />
        <Route path="/admin" element={<AdminTopPage />} />
        <Route path="/admin/leave" element={<LeavePage />} />
        <Route path="/admin/personal-info" element={<PersonalInfoPage />} />
      </Routes>
    </Router>
  );
};

export default App;