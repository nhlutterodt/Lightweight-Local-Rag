import React, { memo, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const LONG_HISTORY_MESSAGE_THRESHOLD = 80;
const LONG_HISTORY_SOFT_RENDER_MS = 32;
const LONG_HISTORY_HARD_RENDER_MS = 64;

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'details', 'summary', 'div'],
  attributes: {
    ...defaultSchema.attributes,
    details: [...(defaultSchema.attributes?.details || []), 'className'],
    summary: [...(defaultSchema.attributes?.summary || []), 'className'],
    div: [...(defaultSchema.attributes?.div || []), 'className'],
  },
};

const markdownRemarkPlugins = [remarkGfm];
const markdownRehypePlugins = [rehypeRaw, [rehypeSanitize, sanitizeSchema]];

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
        return `<div class="thinking-disclosure thinking-disclosure-streaming"><div class="thinking-disclosure-streaming-title">Generating Reasoning...</div><div class="thinking-content">${inner}</div></div>`;
      }
    );
  }

  return formatted;
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

function formatMessageTimestamp(isoTimestamp) {
  if (!isoTimestamp) return null;

  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return null;

  return {
    dateTime: parsed.toISOString(),
    text: parsed.toLocaleString(),
  };
}

function formatCitationScore(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  return `${Math.round(score * 100)}%`;
}

const ChatMessage = memo(function ChatMessage({ message, isGenerating, onRetry }) {
  const recoveryContent = getRecoveryContent(message);
  const timestamp = formatMessageTimestamp(message.createdAt);
  const citations = Array.isArray(message.citations) ? message.citations : [];

  return (
    <div className={`message ${message.role}-message glass`}>
      <div className="content">
        <div className="message-header">
          <h3>{message.role === 'user' ? 'You' : 'System'}</h3>
          {timestamp && (
            <time className="message-time" dateTime={timestamp.dateTime}>
              {timestamp.text}
            </time>
          )}
        </div>
        {message.role === 'ai' && !message.content && isGenerating ? (
          <div className="thinking-status">
            <div className="status-spinner"></div>
            <span>Thinking...</span>
          </div>
        ) : (
          <>
            {message.content ? (
              <div className="message-markdown">
                <ReactMarkdown
                  remarkPlugins={markdownRemarkPlugins}
                  rehypePlugins={markdownRehypePlugins}
                >
                  {formatContent(message.htmlContent || message.content)}
                </ReactMarkdown>
              </div>
            ) : null}
            {recoveryContent && (
              <div className={`message-recovery status-${message.status}`} role="alert">
                <p className="message-recovery-title">{recoveryContent.title}</p>
                <p className="message-recovery-detail">{recoveryContent.detail}</p>
                {message.recoveryPrompt && (
                  <div className="message-recovery-actions">
                    <button
                      type="button"
                      className="btn-secondary message-recovery-button"
                      disabled={isGenerating}
                      onClick={() => onRetry?.(message.recoveryPrompt)}
                    >
                      Retry response
                    </button>
                  </div>
                )}
              </div>
            )}
            {message.status === 'error' && (
              <div className="error-badge" role="alert">
                {message.errorMessage || 'Response failed.'}
              </div>
            )}
            {message.role === 'ai' && citations.length > 0 && (
              <section className="citations" aria-label="Response citations">
                {citations.map((citation, index) => {
                  const fileName = citation.fileName || citation.file || `Source ${index + 1}`;
                  const scoreText = formatCitationScore(citation.score);

                  return (
                    <article key={`${fileName}-${index}`} className="citation-card">
                      <span className="icon" aria-hidden="true">📎</span>
                      <div className="citation-body">
                        <p className="citation-file">{fileName}</p>
                        {citation.headerContext && (
                          <p className="citation-context">{citation.headerContext}</p>
                        )}
                        {citation.preview && (
                          <p className="citation-preview">{citation.preview}</p>
                        )}
                        {scoreText && (
                          <p className="citation-score">Relevance: {scoreText}</p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
});

function resolveNowProvider(nowProvider) {
  if (typeof nowProvider === 'function') {
    return nowProvider;
  }

  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return () => performance.now();
  }

  return () => Date.now();
}

function ChatWindow({ history, isGenerating, sessionNotice, onRetry, onPerformanceSignal, nowProvider }) {
  const bottomRef = useRef(null);
  const fallbackKeyMapRef = useRef(new WeakMap());
  const fallbackKeyCountRef = useRef(0);
  const renderStartRef = useRef(0);
  const lastPerformanceSignalRef = useRef('');
  const getNow = resolveNowProvider(nowProvider);

  renderStartRef.current = getNow();

  const getMessageKey = (message) => {
    if (message.id) {
      return message.id;
    }

    const existingKey = fallbackKeyMapRef.current.get(message);
    if (existingKey) {
      return existingKey;
    }

    const key = `legacy-${fallbackKeyCountRef.current}`;
    fallbackKeyCountRef.current += 1;
    fallbackKeyMapRef.current.set(message, key);
    return key;
  };

  useEffect(() => {
    if (history.length === 0) return;

    bottomRef.current?.scrollIntoView({
      behavior: getScrollBehavior(),
      block: 'end',
    });
  }, [history]);

  useEffect(() => {
    if (history.length < LONG_HISTORY_MESSAGE_THRESHOLD) {
      return;
    }

    const renderDurationMs = Math.max(0, getNow() - renderStartRef.current);
    let severity = null;

    if (renderDurationMs >= LONG_HISTORY_HARD_RENDER_MS) {
      severity = 'warning';
    } else if (renderDurationMs >= LONG_HISTORY_SOFT_RENDER_MS) {
      severity = 'info';
    }

    if (!severity) {
      return;
    }

    const citationCount = history.reduce((total, message) => {
      if (!Array.isArray(message.citations)) {
        return total;
      }
      return total + message.citations.length;
    }, 0);

    const dedupeKey = `${severity}:${history.length}:${citationCount}:${Math.round(renderDurationMs)}`;
    if (lastPerformanceSignalRef.current === dedupeKey) {
      return;
    }

    lastPerformanceSignalRef.current = dedupeKey;
    onPerformanceSignal?.({
      severity,
      durationMs: Number(renderDurationMs.toFixed(1)),
      messageCount: history.length,
      citationCount,
      thresholdMs: severity === 'warning' ? LONG_HISTORY_HARD_RENDER_MS : LONG_HISTORY_SOFT_RENDER_MS,
    });
  }, [getNow, history, onPerformanceSignal]);

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
        history.map((msg) => (
          <ChatMessage
            key={getMessageKey(msg)}
            message={msg}
            isGenerating={isGenerating}
            onRetry={onRetry}
          />
        ))
      )}
      <div ref={bottomRef} aria-hidden="true"></div>
    </div>
  );
}

export default ChatWindow;
