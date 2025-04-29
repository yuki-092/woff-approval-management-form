import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import ApprovalManagementForm from './pages/ApprovalManagementForm';

function App() {
  return (
    <Router>
      <div>
        <Routes>
          <Route path="/" element={<ApprovalManagementForm />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;