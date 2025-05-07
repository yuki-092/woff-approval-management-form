import React from 'react';
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
        </Routes>
      </div>
    </Router>
  );
}

export default App;