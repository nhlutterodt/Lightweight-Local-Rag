import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import InputArea from './components/InputArea';
import { useRagApi } from './hooks/useRagApi';
import { useWindowDimensions } from './hooks/useWindowDimensions';
import AnalyticsPanel from './components/AnalyticsPanel';
import './index.css';

function App() {
  const { isConnected, models, metrics, queue, streamChat, enqueueJob } = useRagApi();
  const { width } = useWindowDimensions();
  const isWide = width > 1200;
  
  const [activeModel, setActiveModel] = useState("llama3");
  const [chatHistory, setChatHistory] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Auto-select first model if available
  useEffect(() => {
    if (models.length > 0 && activeModel === "llama3") {
      setActiveModel(models[0].name);
    }
  }, [models, activeModel]);

  // Handle User Chat Submission
  const handleSendQuery = async (text) => {
    if (!text.trim() || isGenerating) return;
    setIsGenerating(true);
    
    // Optimistic UI Update
    const newChat = [...chatHistory, { role: "user", content: text }];
    setChatHistory(newChat);

    let incomingResponse = "";
    
    // Temporarily push an empty AI message to stream into
    setChatHistory([...newChat, { role: "ai", content: incomingResponse }]);

    // Fire actual stream
    await streamChat(newChat, activeModel, "TestIngest", (data) => {
       if (data.message && data.message.content) {
         incomingResponse += data.message.content;
         setChatHistory([...newChat, { role: "ai", content: incomingResponse }]);
       }
    });

    setIsGenerating(false);
  };

  return (
    <div id="app">
      <Sidebar 
        models={models}
        activeModel={activeModel}
        setActiveModel={setActiveModel}
        isConnected={isConnected}
        metrics={metrics}
        queue={queue}
        isWide={isWide}
      />
      <main className="chat-container">
        <ChatWindow history={chatHistory} />
        <InputArea onSend={handleSendQuery} disabled={isGenerating || !isConnected} />
      </main>

      {isWide && (
        <aside className="sidebar glass" style={{ borderLeft: '1px solid var(--glass-border)', borderRight: 'none', background: 'rgba(59, 130, 246, 0.02)' }}>
          <header style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
            <h2 style={{ fontSize: '1.2rem', color: 'var(--text-main)', margin: 0 }}>System Analytics</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', marginTop: '4px' }}>High-Density View</p>
          </header>
          <nav>
            <AnalyticsPanel metrics={metrics} queue={queue} />
          </nav>
        </aside>
      )}
    </div>
  );
}

export default App;
