import React from 'react';

const CompletePage = () => {
  return (
    <div className="approval-completed-container">
      <h2 className="approval-completed-title">承認／否決が完了しました！</h2>
        <div className="approval-completed-icon">
            <svg
                className="approval-completed-check"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M20 6L9 17l-5-5" />
            </svg>
        </div>
      </div>
  );
};

export default CompletePage;