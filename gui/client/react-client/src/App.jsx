import { useState, useEffect, useReducer, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import InputArea from './components/InputArea';
import ErrorBoundary from './components/ErrorBoundary';
import { useRagApi } from './hooks/useRagApi';
import AnalyticsPanel from './components/AnalyticsPanel';
import { chatReducer, CHAT_ACTIONS, createInitialChatState } from './state/chatStateMachine';
import './index.css';

const STORAGE_KEYS = {
  collection: 'rag.sidebar.collection',
  theme: 'rag.ui.theme',
};

const DEFAULT_THEME = 'dark';
const VALID_THEMES = new Set(['dark', 'light']);
const MAX_OPERATIONAL_ACTIONS = 5;
const PERFORMANCE_ACTION_COOLDOWN_MS = 15000;

function createOperationalAction(kind, message, status = 'info', target = null) {
  return {
    id: crypto.randomUUID(),
    kind,
    message,
    status,
    target,
    timestamp: new Date().toISOString(),
  };
}

function resolveThemePreference(rawTheme) {
  if (typeof rawTheme !== 'string') {
    return DEFAULT_THEME;
  }

  return VALID_THEMES.has(rawTheme) ? rawTheme : DEFAULT_THEME;
}

function readLocalStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore persistence failures (private mode/quota).
  }
}

function App() {
  const { isConnected, isModelReady, models, metrics, queue, metricsState, queueState, streamChat, cancelStreamChat, enqueueJob } = useRagApi();
  
  const [activeModel, setActiveModel] = useState("llama3");
  const [collectionName, setCollectionName] = useState(() => readLocalStorage(STORAGE_KEYS.collection, 'TestIngest'));
  const [chatState, dispatchChat] = useReducer(chatReducer, undefined, createInitialChatState);
  const { history: chatHistory, isGenerating, sessionNotice } = chatState;
  const [operationalActions, setOperationalActions] = useState([]);
  const chatHistoryRef = useRef(chatHistory);
  const activeModelRef = useRef(activeModel);
  const collectionNameRef = useRef(collectionName);
  const isGeneratingRef = useRef(isGenerating);
  const clearedSessionRef = useRef(null);
  const undoTimerRef = useRef(null);
  const lastPerformanceActionRef = useRef({ key: '', timestamp: 0 });
  const [canUndoClear, setCanUndoClear] = useState(false);

  // Auto-select first model if available
  useEffect(() => {
    if (models.length > 0 && activeModel === "llama3") {
      setActiveModel(models[0].name);
    }
  }, [models, activeModel]);

  useEffect(() => {
    writeLocalStorage(STORAGE_KEYS.collection, collectionName);
  }, [collectionName]);

  useEffect(() => {
    const theme = resolveThemePreference(readLocalStorage(STORAGE_KEYS.theme, DEFAULT_THEME));
    document.documentElement.dataset.theme = theme;
  }, []);

  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  useEffect(() => {
    activeModelRef.current = activeModel;
  }, [activeModel]);

  useEffect(() => {
    collectionNameRef.current = collectionName;
  }, [collectionName]);

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  useEffect(() => () => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }
  }, []);

  const handleSendQuery = useCallback(async (text) => {
    const trimmedText = text.trim();
    if (!trimmedText || isGeneratingRef.current) return;

    dispatchChat({ type: CHAT_ACTIONS.SEND_REQUEST, prompt: trimmedText });

    const nextChat = [...chatHistoryRef.current, { role: 'user', content: trimmedText }];

    try {
      await streamChat(nextChat, activeModelRef.current, collectionNameRef.current, (event) => {
        if (event.type === 'start') {
          dispatchChat({ type: CHAT_ACTIONS.STREAM_START });
          return;
        }

        if (event.type === 'token') {
          dispatchChat({ type: CHAT_ACTIONS.STREAM_TOKEN, content: event.content });
          return;
        }

        if (event.type === 'metadata') {
          dispatchChat({ type: CHAT_ACTIONS.STREAM_METADATA, citations: event.citations });
          return;
        }

        if (event.type === 'answer_references') {
          dispatchChat({
            type: CHAT_ACTIONS.STREAM_ANSWER_REFERENCES,
            references: event.references,
          });
          return;
        }

        if (event.type === 'grounding_warning') {
          dispatchChat({
            type: CHAT_ACTIONS.STREAM_GROUNDING_WARNING,
            warning: {
              code: event.code,
              message: event.message,
            },
          });
          return;
        }

        if (event.type === 'error') {
          dispatchChat({ type: CHAT_ACTIONS.STREAM_ERROR, message: event.message });
          return;
        }

        if (event.type === 'cancelled') {
          dispatchChat({ type: CHAT_ACTIONS.STREAM_CANCELLED, message: event.message });
          return;
        }

        if (event.type === 'done') {
          dispatchChat({ type: CHAT_ACTIONS.STREAM_DONE });
        }
      });
    } finally {
      dispatchChat({ type: CHAT_ACTIONS.STREAM_FINISHED });
    }
  }, [streamChat]);

  const handleRetryQuery = useCallback((prompt) => {
    if (!prompt || isGeneratingRef.current) return;
    return handleSendQuery(prompt);
  }, [handleSendQuery]);

  const handleCancelGeneration = useCallback(() => {
    if (!isGeneratingRef.current) return;

    cancelStreamChat();
    dispatchChat({ type: CHAT_ACTIONS.CANCEL_REQUESTED });
  }, [cancelStreamChat]);

  const recordOperationalAction = useCallback((kind, message, status, target = null) => {
    setOperationalActions((current) => [
      createOperationalAction(kind, message, status, target),
      ...current,
    ].slice(0, MAX_OPERATIONAL_ACTIONS));
  }, []);

  const handleChatPerformanceSignal = useCallback((signal) => {
    if (!signal || typeof signal.durationMs !== 'number') {
      return;
    }

    const durationBucket = Math.floor(signal.durationMs / 5) * 5;
    const dedupeKey = `${signal.severity}:${signal.messageCount}:${signal.citationCount}:${durationBucket}`;
    const now = Date.now();

    if (
      lastPerformanceActionRef.current.key === dedupeKey
      && now - lastPerformanceActionRef.current.timestamp < PERFORMANCE_ACTION_COOLDOWN_MS
    ) {
      return;
    }

    lastPerformanceActionRef.current = {
      key: dedupeKey,
      timestamp: now,
    };

    const safeCitationCount = Number.isFinite(signal.citationCount) ? signal.citationCount : 0;
    const safeMessageCount = Number.isFinite(signal.messageCount) ? signal.messageCount : 0;
    const status = signal.severity === 'warning' ? 'warning' : 'info';
    const messagePrefix = signal.severity === 'warning' ? 'Long-history render warning' : 'Long-history render advisory';

    recordOperationalAction(
      'performance',
      `${messagePrefix}: ${signal.durationMs}ms for ${safeMessageCount} messages and ${safeCitationCount} citations (threshold ${signal.thresholdMs}ms).`,
      status,
      {
        section: 'chat',
        label: 'Open chat history',
      },
    );
  }, [recordOperationalAction]);

  const handleEnqueue = useCallback(async (path, collection) => {
    try {
      const result = await enqueueJob(path, collection);
      const fileLabel = path?.split(/[\\/]/).filter(Boolean).pop() || path || 'item';
      const queueEntityId = result?.entityId || result?.id || path;
      recordOperationalAction(
        'enqueue',
        `Queued ${fileLabel} for collection ${collection}.`,
        'success',
        {
          section: 'queue',
          entityId: queueEntityId ? String(queueEntityId) : undefined,
          label: 'View queued job',
        },
      );
      return result;
    } catch (error) {
      recordOperationalAction(
        'enqueue',
        `Queue request failed for ${collection}: ${error.message || 'Unknown error'}.`,
        'error',
        {
          section: 'queue',
          label: 'Open queue panel',
        },
      );
      throw error;
    }
  }, [enqueueJob, recordOperationalAction]);

  const handleClearSession = useCallback(() => {
    if (isGeneratingRef.current) {
      cancelStreamChat();
      dispatchChat({ type: CHAT_ACTIONS.CLEAR_SESSION_DURING_GENERATION });
      recordOperationalAction('session', 'Generation cancelled and session cleared.', 'warning', {
        section: 'chat',
        label: 'Open chat history',
      });
      clearedSessionRef.current = null;
      setCanUndoClear(false);

      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
      return;
    }

    const historySnapshot = chatHistoryRef.current;
    if (historySnapshot.length > 0) {
      clearedSessionRef.current = {
        history: historySnapshot,
      };
      setCanUndoClear(true);

      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
      }

      undoTimerRef.current = window.setTimeout(() => {
        clearedSessionRef.current = null;
        setCanUndoClear(false);
        undoTimerRef.current = null;
      }, 10000);

      recordOperationalAction('session', 'Session cleared. Undo is available for 10 seconds.', 'warning', {
        section: 'chat',
        label: 'Open chat history',
      });
    }

    dispatchChat({ type: CHAT_ACTIONS.CLEAR_SESSION });
  }, [cancelStreamChat, recordOperationalAction]);

  const handleUndoClearSession = useCallback(() => {
    if (isGeneratingRef.current || !clearedSessionRef.current) {
      return;
    }

    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    dispatchChat({
      type: CHAT_ACTIONS.RESTORE_SESSION,
      history: clearedSessionRef.current.history,
      sessionNotice: 'Session restored.',
    });

    recordOperationalAction('session', 'Session restored from undo.', 'success', {
      section: 'chat',
      label: 'Open chat history',
    });

    clearedSessionRef.current = null;
    setCanUndoClear(false);
  }, [recordOperationalAction]);

  return (
    <div id="app">
      <a href="#userInput" className="skip-link">Skip to chat input</a>
      <ErrorBoundary
        title="Sidebar unavailable"
        message="The workspace controls could not be rendered. Retry this section to restore model and ingestion controls."
      >
        <Sidebar 
          models={models}
          activeModel={activeModel}
          setActiveModel={setActiveModel}
          collectionName={collectionName}
          setCollectionName={setCollectionName}
          isConnected={isConnected}
          isModelReady={isModelReady}
          onEnqueue={handleEnqueue}
          isGenerating={isGenerating}
          onClearSession={handleClearSession}
          canUndoClear={canUndoClear}
          onUndoClear={handleUndoClearSession}
        />
      </ErrorBoundary>
      <ErrorBoundary
        title="Chat workspace unavailable"
        message="The chat surface failed to render. Retry this section to restore the conversation view and input box."
      >
        <main id="mainContent" className="chat-container">
          <ChatWindow
            history={chatHistory}
            isGenerating={isGenerating}
            sessionNotice={sessionNotice}
            onRetry={handleRetryQuery}
            onPerformanceSignal={handleChatPerformanceSignal}
          />
          <InputArea
            onSend={handleSendQuery}
            onCancel={handleCancelGeneration}
            disabled={!isConnected}
            isGenerating={isGenerating}
          />
        </main>
      </ErrorBoundary>

      <ErrorBoundary
        title="Analytics unavailable"
        message="Operational analytics failed to render. Retry this section to restore queue and index monitoring."
      >
        <aside aria-labelledby="analyticsPanelTitle" className="sidebar glass analytics-aside">
          <header className="analytics-aside-header">
            <h2 id="analyticsPanelTitle" className="analytics-aside-title">System Analytics</h2>
            <p className="analytics-aside-subtitle">High-Density View</p>
          </header>
          <div>
            <AnalyticsPanel
              metrics={metrics}
              queue={queue}
              metricsState={metricsState}
              queueState={queueState}
              operationalActions={operationalActions}
            />
          </div>
        </aside>
      </ErrorBoundary>
    </div>
  );
}

export default App;
