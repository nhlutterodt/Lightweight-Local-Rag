import React, { memo, useEffect, useRef, useState } from 'react';

function InputArea({ onSend, onCancel, disabled, isGenerating }) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  const resizeTextarea = (element) => {
    if (!element) return;

    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  };

  useEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [text]);

  const handleSend = () => {
    const trimmedText = text.trim();
    if (!trimmedText || disabled || isGenerating) return;

    onSend(trimmedText);
    setText("");
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (event) => {
    setText(event.target.value);
    resizeTextarea(event.target);
  };

  return (
    <div className="input-area glass">
      <div className="input-wrapper">
        <label className="sr-only" htmlFor="userInput">Query message</label>
        <textarea 
          ref={textareaRef}
          id="userInput" 
          placeholder="Ask anything about your documents..." 
          rows="1"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        ></textarea>
        <button 
          id="sendMessage" 
          type="button"
          aria-label={isGenerating ? 'Stop generation' : 'Send message'}
          disabled={isGenerating ? false : (disabled || !text.trim())}
          onClick={isGenerating ? onCancel : handleSend}
          data-tooltip={isGenerating ? 'Stop generating this response' : 'Send your query to the AI'}
        >
          {isGenerating ? (
            <span aria-hidden="true">■</span>
          ) : (
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"></path>
            </svg>
          )}
        </button>
      </div>
      <div className="input-footer">
        Powered by Native Ollama Embeddings & LanceDB • Local Execution Only
      </div>
    </div>
  );
}

export default memo(InputArea);
