import React, { useState } from 'react';
import { useSidebarPreferences } from '../hooks/useSidebarPreferences';
import ModelSelector from './sidebar/ModelSelector';
import CollectionInput from './sidebar/CollectionInput';
import ConnectionStatus from './sidebar/ConnectionStatus';
import IngestControls from './sidebar/IngestControls';

function Sidebar({ models, activeModel, setActiveModel, collectionName, setCollectionName, isConnected, isModelReady, onEnqueue, onClearSession, isGenerating = false }) {
  const {
    ingestPath,
    setIngestPath,
    clearPathOnQueue,
    setClearPathOnQueue,
    recentPaths,
    recentCollections,
    rememberEnqueue,
  } = useSidebarPreferences();
  const [isBrowseOpen, setIsBrowseOpen] = useState(false);
  const [enqueueError, setEnqueueError] = useState(null);

  const handleEnqueue = async () => {
    setEnqueueError(null);
    if (!ingestPath || !collectionName) {
      setEnqueueError("Path and collection are required.");
      return;
    }
    try {
      if (onEnqueue) {
        await onEnqueue(ingestPath, collectionName);
        rememberEnqueue({ path: ingestPath, collection: collectionName });
        if (clearPathOnQueue) {
          setIngestPath('');
        }
      }
    } catch (err) {
      setEnqueueError(err.message);
    }
  };
  return (
    <aside className="sidebar glass" aria-labelledby="sidebarTitle">
      <header>
        <h1 id="sidebarTitle">Local RAG</h1>
        <p>v2.1 Pro</p>
      </header>
      
      <nav>
        <ModelSelector models={models} activeModel={activeModel} setActiveModel={setActiveModel} />

        <CollectionInput
          collectionName={collectionName}
          setCollectionName={setCollectionName}
          recentCollections={recentCollections}
        />

        <ConnectionStatus isConnected={isConnected} isModelReady={isModelReady} />

        <div className="nav-divider"></div>

        <IngestControls
          ingestPath={ingestPath}
          setIngestPath={setIngestPath}
          clearPathOnQueue={clearPathOnQueue}
          setClearPathOnQueue={setClearPathOnQueue}
          recentPaths={recentPaths}
          enqueueError={enqueueError}
          onEnqueue={handleEnqueue}
          isConnected={isConnected}
          isBrowseOpen={isBrowseOpen}
          setIsBrowseOpen={setIsBrowseOpen}
        />
        <div className="nav-divider"></div>

      </nav>
      
      <footer>
        <button
          id="clearChat"
          type="button"
          className="btn-secondary"
          data-tooltip={isGenerating ? "Cancel generation and clear the current conversation history" : "Clear the current conversation history"}
          onClick={onClearSession}
        >
          {isGenerating ? 'Stop & Clear Session' : 'Clear Session'}
        </button>
      </footer>
      
    </aside>
  );
}

export default Sidebar;
