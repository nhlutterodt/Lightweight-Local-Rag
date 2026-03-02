import React from 'react';

function formatContent(content) {
  if (!content) return "";
  let formatted = content;
  
  // Process explicit <think>...</think> tags
  formatted = formatted.replace(
    /<think>([\s\S]*?)<\/think>/gi,
    (match, inner) => {
      return `<details class="thinking-disclosure"><summary>Reasoning Process</summary><div class="thinking-content">${inner.trim()}</div></details>`;
    }
  );
  
  // Process unclosed <think> tags (streaming)
  if (formatted.includes("<think>")) {
    formatted = formatted.replace(
      /<think>([\s\S]*)$/gi,
      (match, inner) => {
        return `<div class="thinking-disclosure" style="border-color: var(--accent-secondary);"><div style="padding: 8px 12px; font-size: 0.8rem; color: var(--accent-secondary); border-bottom: 1px solid rgba(139,92,246,0.2);">🧠 Generating Reasoning...</div><div class="thinking-content">${inner}</div></div>`;
      }
    );
  }
  return formatted;
}

function ChatWindow({ history, isGenerating }) {
  return (
    <div id="chatWindow" className="chat-window">
      {history.length === 0 ? (
        <div className="message ai-message glass">
          <div className="content">
            <h2>Welcome to the Local RAG Dashboard</h2>
            <p>I can answer questions based on your ingested documents. Just type a query below to begin.</p>
            <div className="badges">
              <span className="badge">Local AI</span>
              <span className="badge">No Internet</span>
              <span className="badge">Privacy First</span>
            </div>
          </div>
        </div>
      ) : (
        history.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}-message glass`}>
            <div className="content">
              <h3>{msg.role === 'user' ? 'You' : 'System'}</h3>
              {msg.role === 'ai' && !msg.content && isGenerating ? (
                <div className="thinking-status">
                  <div className="status-spinner"></div>
                  <span>Thinking...</span>
                </div>
              ) : (
                <div style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: formatContent(msg.htmlContent || msg.content) }}></div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default ChatWindow;
