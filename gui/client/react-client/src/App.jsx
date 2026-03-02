import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import InputArea from './components/InputArea';
import { useRagApi } from './hooks/useRagApi';
import './index.css';

function App() {
  const { isConnected, models, metrics, queue, streamChat, enqueueJob } = useRagApi();
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
      />
      <main className="chat-container">
        <ChatWindow history={chatHistory} />
        <InputArea onSend={handleSendQuery} disabled={isGenerating || !isConnected} />
      </main>
    </div>
  );
}

export default App;
