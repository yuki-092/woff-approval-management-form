import React, { useEffect } from 'react';

const CompletePage = () => {
  // /complete 表示時に、拡張機能などが挿入するオーバーレイを強制的に非表示化
  useEffect(() => {
    const hide = (selector: string) => {
      document.querySelectorAll(selector).forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
    };
    // 代表的な注入要素（Ubersuggest 等）
    hide('div[style*="position: absolute"][style*="border: 1px solid rgb(255, 0, 0)"]');
    hide('.ue-sidebar-container');
    hide('#tldx-toast-container');
    hide('tldx-lmi-shadow-root');
  }, []);

  return (
    <main
      className="approval-completed-container"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '48px 16px',
        background: '#fff',
        color: '#111',
        position: 'relative',
        // 可能な限り最前面へ
        zIndex: 2147483647,
      }}
    >
      <h2 className="approval-completed-title" style={{ margin: 0 }}>
        承認／否決が完了しました！
      </h2>
      <div className="approval-completed-icon">
        <svg
          className="approval-completed-check"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 64, height: 64 }}
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
    </main>
  );
};

export default CompletePage;