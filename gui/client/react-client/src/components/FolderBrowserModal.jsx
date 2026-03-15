import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

function FolderBrowserModal({ isOpen, onClose, onSelect, initialPath = "" }) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [parentPath, setParentPath] = useState(null);
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      fetchDirectory(initialPath);
    }
  }, [isOpen, initialPath]);

  const fetchDirectory = async (pathStr) => {
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
  };

  useEffect(() => {
    if (!isOpen || loading || error) return;

    const rows = [
      ...(parentPath ? [{ isParent: true, path: parentPath }] : []),
      ...contents.map((item) => ({ ...item, isParent: false }))
    ];

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (!rows.length) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, rows.length - 1));
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const selected = rows[activeIndex];
        if (!selected) return;
        if (selected.isParent || selected.isDirectory) {
          fetchDirectory(selected.path);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, contents, error, isOpen, loading, onClose, parentPath]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="modal-content glass" style={{
        width: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        backgroundColor: 'var(--bg-panel)', padding: '20px', borderRadius: '8px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Select Folder</h2>
          <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={onClose}>✕</button>
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
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button 
            className="btn-primary" 
            onClick={() => onSelect(currentPath)}
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
