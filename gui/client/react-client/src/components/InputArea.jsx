import React, { useState } from 'react';

function InputArea({ onSend, disabled }) {
  const [text, setText] = useState("");

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim() && !disabled) {
        onSend(text);
        setText("");
      }
    }
  };

  return (
    <div className="input-area glass">
      <div className="input-wrapper">
        <textarea 
          id="userInput" 
          placeholder="Ask anything about your documents..." 
          rows="1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        ></textarea>
        <button 
          id="sendMessage" 
          disabled={disabled || !text.trim()} 
          onClick={() => { onSend(text); setText(""); }}
          data-tooltip="Send your query to the AI"
        >
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"></path>
          </svg>
        </button>
      </div>
      <div className="input-footer">
        Powered by Native Ollama Embeddings & LanceDB • Local Execution Only
      </div>
    </div>
  );
}

export default InputArea;
