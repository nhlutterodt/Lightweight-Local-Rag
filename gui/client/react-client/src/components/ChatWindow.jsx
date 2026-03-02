import React from 'react';

function ChatWindow({ history }) {
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
              <div dangerouslySetInnerHTML={{ __html: msg.htmlContent || msg.content }}></div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default ChatWindow;
