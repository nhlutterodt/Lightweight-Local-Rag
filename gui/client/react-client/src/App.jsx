import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import InputArea from './components/InputArea';
import ErrorBoundary from './components/ErrorBoundary';
import { useRagApi } from './hooks/useRagApi';
import AnalyticsPanel from './components/AnalyticsPanel';
import './index.css';

const STORAGE_KEYS = {
  collection: 'rag.sidebar.collection',
};

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

function createAssistantMessage(overrides = {}) {
  return {
    role: 'ai',
    content: '',
    status: 'idle',
    errorMessage: '',
    recoveryPrompt: '',
    ...overrides,
  };
}

function App() {
  const { isConnected, isModelReady, models, metrics, queue, metricsState, queueState, streamChat, cancelStreamChat, enqueueJob } = useRagApi();
  
  const [activeModel, setActiveModel] = useState("llama3");
  const [collectionName, setCollectionName] = useState(() => readLocalStorage(STORAGE_KEYS.collection, 'TestIngest'));
  const [chatHistory, setChatHistory] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionNotice, setSessionNotice] = useState('');

  // Auto-select first model if available
  useEffect(() => {
    if (models.length > 0 && activeModel === "llama3") {
      setActiveModel(models[0].name);
    }
  }, [models, activeModel]);

  useEffect(() => {
    writeLocalStorage(STORAGE_KEYS.collection, collectionName);
  }, [collectionName]);

  const handleRetryQuery = (prompt) => {
    if (!prompt || isGenerating) return;
    return handleSendQuery(prompt);
  };

  const handleCancelGeneration = () => {
    if (!isGenerating) return;

    cancelStreamChat();
    setIsGenerating(false);
    setSessionNotice('Generation cancelled.');
  };

  const handleClearSession = () => {
    if (isGenerating) {
      cancelStreamChat();
      setIsGenerating(false);
      setChatHistory([]);
      setSessionNotice('Generation cancelled and session cleared.');
      return;
    }

    setChatHistory([]);
    setSessionNotice('Session cleared.');
  };

  // Handle User Chat Submission
  const handleSendQuery = async (text) => {
    const trimmedText = text.trim();
    if (!trimmedText || isGenerating) return;

    setIsGenerating(true);
    setSessionNotice('');

    const nextChat = [...chatHistory, { role: 'user', content: trimmedText }];
    let assistantMessage = createAssistantMessage({
      status: 'streaming',
      recoveryPrompt: trimmedText,
    });
    const syncChatHistory = () => setChatHistory([...nextChat, assistantMessage]);

    syncChatHistory();

    try {
      await streamChat(nextChat, activeModel, collectionName, (event) => {
        if (event.type === 'start') {
          assistantMessage = {
            ...assistantMessage,
            status: 'streaming',
            errorMessage: '',
          };
          syncChatHistory();
          return;
        }

        if (event.type === 'token') {
          assistantMessage = {
            ...assistantMessage,
            content: `${assistantMessage.content}${event.content}`,
          };
          syncChatHistory();
          return;
        }

        if (event.type === 'error') {
          const hasPartialContent = assistantMessage.content.trim().length > 0;
          assistantMessage = {
            ...assistantMessage,
            status: hasPartialContent ? 'interrupted' : 'failed-before-start',
            errorMessage: event.message || 'Unable to complete request.',
            recoveryPrompt: trimmedText,
          };
          syncChatHistory();
          return;
        }

        if (event.type === 'cancelled') {
          const hasPartialContent = assistantMessage.content.trim().length > 0;
          assistantMessage = {
            ...assistantMessage,
            status: hasPartialContent ? 'cancelled' : 'cancelled-before-start',
            errorMessage: event.message || 'Generation cancelled.',
            recoveryPrompt: trimmedText,
          };
          syncChatHistory();
          return;
        }

        if (event.type === 'done') {
          assistantMessage = {
            ...assistantMessage,
            status: assistantMessage.errorMessage ? 'error' : 'done',
          };
          syncChatHistory();
        }
      });
    } finally {
      setIsGenerating(false);
    }
  };

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
          onEnqueue={enqueueJob}
          isGenerating={isGenerating}
          onClearSession={handleClearSession}
        />
      </ErrorBoundary>
      <ErrorBoundary
        title="Chat workspace unavailable"
        message="The chat surface failed to render. Retry this section to restore the conversation view and input box."
      >
        <main id="mainContent" className="chat-container">
          <ChatWindow history={chatHistory} isGenerating={isGenerating} sessionNotice={sessionNotice} onRetry={handleRetryQuery} />
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
            <AnalyticsPanel metrics={metrics} queue={queue} metricsState={metricsState} queueState={queueState} />
          </div>
        </aside>
      </ErrorBoundary>
    </div>
  );
}

export default App;
