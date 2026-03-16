import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const DOCKER_DATA_ROOT = '/data';

function formatPathLabel(pathValue) {
  if (!pathValue) return 'Loading default...';

  if (pathValue === DOCKER_DATA_ROOT) {
    return 'Data Volume Root (/data)';
  }

  if (pathValue.startsWith(`${DOCKER_DATA_ROOT}/`)) {
    const relativePath = pathValue.slice(DOCKER_DATA_ROOT.length);
    return `Data Volume${relativePath} (${pathValue})`;
  }

  if (/^[a-zA-Z]:\\?$/.test(pathValue)) {
    return `Local Disk (${pathValue.replace(/\\$/, '')})`;
  }

  return pathValue;
}

function formatBreadcrumbLabel(segment, index, segments, fullPath) {
  if (!segment) return segment;

  if (fullPath.startsWith(`${DOCKER_DATA_ROOT}/`) || fullPath === DOCKER_DATA_ROOT) {
    if (index === 0 && segment === 'data') {
      return 'Data Volume';
    }
  }

  if (index === 0 && /^[a-zA-Z]:$/.test(segment)) {
    return `Local Disk ${segment}`;
  }

  if (fullPath.startsWith('\\\\') && index === 0) {
    return `Network ${segment}`;
  }

  return segment;
}

function FolderBrowserModal({ isOpen, onClose, onSelect, initialPath = "" }) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [parentPath, setParentPath] = useState(null);
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef(null);
  const listboxRef = useRef(null);
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

  const getOptionId = useCallback((index) => `folder-browser-option-${index}`, []);

  const activeDescendantId =
    !loading && !error && rows.length > 0 && activeIndex >= 0 && activeIndex < rows.length
      ? getOptionId(activeIndex)
      : undefined;

  useEffect(() => {
    if (!isOpen || !activeDescendantId) return;

    const activeElement = document.getElementById(activeDescendantId);
    activeElement?.scrollIntoView({ block: 'nearest' });
  }, [activeDescendantId, isOpen]);

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

  };

  const handleListboxKeyDown = (event) => {
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

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(rows.length - 1);
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
    <div className="modal-overlay folder-browser-overlay">
      <div
        id="folder-browser-dialog"
        className="modal-content glass folder-browser-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-browser-title"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="folder-browser-header">
          <h2 id="folder-browser-title" className="folder-browser-title">Select Folder</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="btn-secondary folder-browser-close-button"
            aria-label="Close folder browser"
            onClick={handleClose}
          >
            ✕
          </button>
        </div>

        <div className="folder-browser-path-box">
          <strong>Path:</strong> {formatPathLabel(currentPath)}
        </div>

        <div className="folder-browser-breadcrumbs">
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
                className="btn-secondary folder-browser-crumb-button"
                onClick={() => fetchDirectory(crumbPath)}
              >
                {formatBreadcrumbLabel(segment, index, segments, currentPath)}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="folder-browser-error">
            {error}
          </div>
        )}

        <div className="folder-browser-list-shell">
          {loading ? (
            <div className="folder-browser-loading">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="folder-browser-empty">Empty directory</div>
          ) : (
            <ul
              ref={listboxRef}
              className="folder-browser-list"
              role="listbox"
              aria-label="Directory contents"
              aria-activedescendant={activeDescendantId}
              tabIndex={0}
              onKeyDown={handleListboxKeyDown}
            >
              {parentPath && (
                <li 
                  id={getOptionId(0)}
                  className={`folder-browser-item folder-browser-parent-item ${activeIndex === 0 ? 'is-active' : ''}`}
                  role="option"
                  aria-selected={activeIndex === 0}
                  onClick={() => {
                    setActiveIndex(0);
                    listboxRef.current?.focus();
                  }}
                  onDoubleClick={() => fetchDirectory(parentPath)}
                >
                  📁 <strong>..</strong>
                </li>
              )}
              {contents.map((item, idx) => {
                const itemIndex = parentPath ? idx + 1 : idx;

                return (
                <li 
                  key={item.path}
                  id={getOptionId(itemIndex)}
                  className={`folder-browser-item ${item.isDirectory ? 'is-directory' : 'is-file'} ${activeIndex === itemIndex ? 'is-active' : ''}`}
                  role="option"
                  aria-selected={activeIndex === itemIndex}
                  aria-disabled={!item.isDirectory}
                  onClick={() => {
                    setActiveIndex(itemIndex);
                    listboxRef.current?.focus();
                  }}
                  onDoubleClick={() => item.isDirectory ? fetchDirectory(item.path) : null}
                >
                  {item.isDirectory ? '📁' : '📄'} {item.name}
                </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="folder-browser-actions">
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
