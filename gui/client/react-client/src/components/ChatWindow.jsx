import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';

const sanitizeOptions = {
  ADD_TAGS: ['details', 'summary'],
  ADD_ATTR: ['class', 'style'],
};

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
  return DOMPurify.sanitize(formatted, sanitizeOptions);
}

function getScrollBehavior() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'smooth';
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function getRecoveryContent(message) {
  if (message.status === 'failed-before-start') {
    return {
      title: 'Response could not start',
      detail: message.errorMessage || 'The backend failed before any response content was returned.',
    };
  }

  if (message.status === 'interrupted') {
    return {
      title: 'Response interrupted',
      detail: message.errorMessage || 'The response stopped before it completed. You can retry from the same prompt.',
    };
  }

  if (message.status === 'cancelled' || message.status === 'cancelled-before-start') {
    return {
      title: 'Response cancelled',
      detail: message.errorMessage || 'Generation was cancelled before completion.',
    };
  }

  return null;
}

function ChatWindow({ history, isGenerating, sessionNotice, onRetry }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (history.length === 0) return;

    bottomRef.current?.scrollIntoView({
      behavior: getScrollBehavior(),
      block: 'end',
    });
  }, [history]);

  return (
    <div
      id="chatWindow"
      className="chat-window"
      role="log"
      aria-label="Conversation history"
      aria-live="polite"
      aria-relevant="additions text"
      aria-busy={isGenerating}
    >
      {history.length === 0 ? (
        <div className="message ai-message glass">
          <div className="content">
            <h2>Welcome to the Local RAG Dashboard</h2>
            <p>I can answer questions based on your ingested documents. Just type a query below to begin.</p>
            {sessionNotice && (
              <p className="session-notice" role="status" aria-live="polite">{sessionNotice}</p>
            )}
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
                <>
                  {msg.content ? (
                    <div style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: formatContent(msg.htmlContent || msg.content) }}></div>
                  ) : null}
                  {getRecoveryContent(msg) && (
                    <div className={`message-recovery status-${msg.status}`} role="alert">
                      <p className="message-recovery-title">{getRecoveryContent(msg).title}</p>
                      <p className="message-recovery-detail">{getRecoveryContent(msg).detail}</p>
                      {msg.recoveryPrompt && (
                        <div className="message-recovery-actions">
                          <button
                            type="button"
                            className="btn-secondary message-recovery-button"
                            disabled={isGenerating}
                            onClick={() => onRetry?.(msg.recoveryPrompt)}
                          >
                            Retry response
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {msg.status === 'error' && (
                    <div className="error-badge" role="alert">
                      {msg.errorMessage || 'Response failed.'}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))
      )}
      <div ref={bottomRef} aria-hidden="true"></div>
    </div>
  );
}

export default ChatWindow;
