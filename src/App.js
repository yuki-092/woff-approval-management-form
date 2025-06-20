import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ApprovalManagementForm from './pages/ApprovalManagementForm';
import AdminTopPage from './pages/admin/AdminTopPage';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ApprovalManagementForm />} />
        <Route path="/admin" element={<AdminTopPage />} />
      </Routes>
    </Router>
  );
};

export default App;