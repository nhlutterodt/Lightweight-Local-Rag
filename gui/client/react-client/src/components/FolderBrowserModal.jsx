import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function FolderBrowserModal({ isOpen, onClose, onSelect, initialPath = "" }) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [parentPath, setParentPath] = useState(null);
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previouslyFocusedElementRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current = document.activeElement;
      fetchDirectory(initialPath);
    }
  }, [isOpen, initialPath]);

  const fetchDirectory = useCallback(async (pathStr) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/browse', API_BASE);
      if (pathStr) url.searchParams.append('path', pathStr);
      
      const res = await fetch(url.toString());
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to read directory');
      }

      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setContents(data.contents);
      setActiveIndex(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const restoreFocus = useCallback(() => {
    if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === 'function') {
      previouslyFocusedElementRef.current.focus();
    }
  }, []);

  const handleClose = useCallback(() => {
    restoreFocus();
    onClose();
  }, [onClose, restoreFocus]);

  const handleSelectCurrentFolder = useCallback(() => {
    restoreFocus();
    onSelect(currentPath);
  }, [currentPath, onSelect, restoreFocus]);

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();
  }, [isOpen]);

  const rows = [
    ...(parentPath ? [{ isParent: true, path: parentPath }] : []),
    ...contents.map((item) => ({ ...item, isParent: false })),
  ];

  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
      return;
    }

    if (event.key === 'Tab') {
      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [],
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
      return;
    }

    if (loading || error || !rows.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, rows.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = rows[activeIndex];
      if (selected && (selected.isParent || selected.isDirectory)) {
        fetchDirectory(selected.path);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div
        id="folder-browser-dialog"
        className="modal-content glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-browser-title"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={handleDialogKeyDown}
        style={{
        width: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        backgroundColor: 'var(--bg-panel)', padding: '20px', borderRadius: '8px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
          <h2 id="folder-browser-title" style={{ margin: 0, fontSize: '1.2rem' }}>Select Folder</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="btn-secondary"
            style={{ padding: '4px 8px' }}
            aria-label="Close folder browser"
            onClick={handleClose}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '8px', backgroundColor: 'var(--bg-main)', borderRadius: '4px', marginBottom: '10px', wordBreak: 'break-all' }}>
          <strong>Path:</strong> {currentPath || "Loading default..."}
        </div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {currentPath.split(/[/\\]+/).filter(Boolean).map((segment, index, segments) => {
            const prefix = currentPath.startsWith('\\\\') ? '\\\\' : (currentPath.includes(':') ? `${segments[0]}\\` : '/');
            const pathParts = segments.slice(0, index + 1);
            const crumbPath = currentPath.includes(':')
              ? `${segments[0]}\\${pathParts.slice(1).join('\\')}`
              : `${prefix}${pathParts.join('/')}`;

            return (
              <button
                key={`${segment}-${index}`}
                type="button"
                className="btn-secondary"
                style={{ marginTop: 0, padding: '2px 8px', fontSize: '0.75rem' }}
                onClick={() => fetchDirectory(crumbPath)}
              >
                {segment}
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{ color: 'var(--color-error)', marginBottom: '10px', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <div style={{
          flex: 1, overflowY: 'auto', border: '1px solid var(--glass-border)',
          borderRadius: '4px', backgroundColor: 'var(--bg-main)', padding: '4px'
        }}>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {parentPath && (
                <li 
                  onClick={() => setActiveIndex(0)}
                  onDoubleClick={() => fetchDirectory(parentPath)}
                  style={{
                    padding: '8px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--glass-border)',
                    backgroundColor: activeIndex === 0 ? 'rgba(255,255,255,0.08)' : 'transparent'
                  }}
                >
                  📁 <strong>..</strong>
                </li>
              )}
              {contents.map((item, idx) => {
                const itemIndex = parentPath ? idx + 1 : idx;

                return (
                <li 
                  key={item.path}
                  onClick={() => setActiveIndex(itemIndex)}
                  onDoubleClick={() => item.isDirectory ? fetchDirectory(item.path) : null}
                  style={{
                    padding: '8px',
                    cursor: item.isDirectory ? 'pointer' : 'default',
                    borderBottom: '1px solid var(--glass-border)',
                    opacity: item.isDirectory ? 1 : 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: activeIndex === itemIndex
                      ? 'rgba(255,255,255,0.08)'
                      : 'transparent'
                  }}
                >
                  {item.isDirectory ? '📁' : '📄'} {item.name}
                </li>
                );
              })}
              {contents.length === 0 && !parentPath && (
                <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>Empty directory</div>
              )}
            </ul>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' }}>
          <button type="button" className="btn-secondary" onClick={handleClose}>Cancel</button>
          <button 
            type="button"
            className="btn-primary" 
            onClick={handleSelectCurrentFolder}
            disabled={loading || error || !currentPath}
          >
            Select Current Folder
          </button>
        </div>
      </div>
    </div>
  );
}

export default FolderBrowserModal;
