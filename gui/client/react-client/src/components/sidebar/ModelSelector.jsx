import React from 'react';

function ModelSelector({ models, activeModel, setActiveModel }) {
  return (
    <div className="nav-item">
      <label htmlFor="modelSelect">AI Model</label>
      <select
        id="modelSelect"
        value={activeModel}
        onChange={(event) => setActiveModel(event.target.value)}
      >
        {models.length > 0 ? (
          models.map((model) => (
            <option key={model.name} value={model.name}>
              {model.name} ({(model.size / 1024 / 1024 / 1024).toFixed(1)} GB)
            </option>
          ))
        ) : (
          <option value="llama3">Llama 3 (Default)</option>
        )}
      </select>
    </div>
  );
}

export default ModelSelector;
