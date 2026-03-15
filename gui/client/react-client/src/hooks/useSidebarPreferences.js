import { useEffect, useState } from 'react';

const STORAGE_KEYS = {
  ingestPath: 'rag.sidebar.ingestPath',
  clearOnQueue: 'rag.sidebar.clearPathOnQueue',
  recentPaths: 'rag.sidebar.recentPaths',
  recentCollections: 'rag.sidebar.recentCollections',
};

function readLocalStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function readArrayStorage(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore persistence failures (private mode/quota).
  }
}

function writeArrayStorage(key, value) {
  writeLocalStorage(key, JSON.stringify(value));
}

function updateRecentList(list, value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return list;
  const deduped = [trimmed, ...list.filter((item) => item !== trimmed)];
  return deduped.slice(0, 8);
}

export function useSidebarPreferences() {
  const [ingestPath, setIngestPath] = useState(() => readLocalStorage(STORAGE_KEYS.ingestPath, ''));
  const [clearPathOnQueue, setClearPathOnQueue] = useState(() => readLocalStorage(STORAGE_KEYS.clearOnQueue, 'false') === 'true');
  const [recentPaths, setRecentPaths] = useState(() => readArrayStorage(STORAGE_KEYS.recentPaths));
  const [recentCollections, setRecentCollections] = useState(() => readArrayStorage(STORAGE_KEYS.recentCollections));

  useEffect(() => {
    writeLocalStorage(STORAGE_KEYS.ingestPath, ingestPath);
  }, [ingestPath]);

  useEffect(() => {
    writeLocalStorage(STORAGE_KEYS.clearOnQueue, clearPathOnQueue ? 'true' : 'false');
  }, [clearPathOnQueue]);

  useEffect(() => {
    writeArrayStorage(STORAGE_KEYS.recentPaths, recentPaths);
  }, [recentPaths]);

  useEffect(() => {
    writeArrayStorage(STORAGE_KEYS.recentCollections, recentCollections);
  }, [recentCollections]);

  const rememberEnqueue = ({ path, collection }) => {
    setRecentPaths((prev) => updateRecentList(prev, path));
    setRecentCollections((prev) => updateRecentList(prev, collection));
  };

  return {
    ingestPath,
    setIngestPath,
    clearPathOnQueue,
    setClearPathOnQueue,
    recentPaths,
    recentCollections,
    rememberEnqueue,
  };
}
