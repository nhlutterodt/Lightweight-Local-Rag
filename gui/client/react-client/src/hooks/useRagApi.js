import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";
const API_URL = `${API_BASE}/api`;

async function getResponseErrorMessage(response) {
  try {
    const data = await response.json();
    return data.message || data.error || `Server returned ${response.status}`;
  } catch {
    return `Server returned ${response.status}`;
  }
}

function nowIsoString() {
  return new Date().toISOString();
}

function getQueueIdentity(job) {
  if (job?.entityId) return job.entityId;
  if (job?.id) return String(job.id);
  if (job?.path) return String(job.path);
  return '';
}

function buildQueueFingerprint(job) {
  const stableParts = [
    job?.id,
    job?.path,
    job?.collection,
    job?.createdAt,
    job?.submittedAt,
    job?.enqueuedAt,
  ].filter(Boolean);

  if (stableParts.length > 0) {
    return stableParts.join('|');
  }

  const fallbackSource = Object.keys(job || {})
    .filter((key) => key !== 'status' && key !== 'updatedAt' && key !== 'progress')
    .sort()
    .map((key) => `${key}:${JSON.stringify(job[key])}`)
    .join('|');

  return fallbackSource || null;
}

function normalizeQueueJobs(rawJobs, idMapRef) {
  const seenFingerprints = new Set();

  const jobs = rawJobs.map((job) => {
    if (job?.entityId) {
      return job;
    }

    if (job?.id) {
      return {
        ...job,
        entityId: String(job.id),
      };
    }

    const fingerprint = buildQueueFingerprint(job);
    if (!fingerprint) {
      return {
        ...job,
        entityId: `queue-${crypto.randomUUID()}`,
      };
    }

    seenFingerprints.add(fingerprint);
    let entityId = idMapRef.current.get(fingerprint);
    if (!entityId) {
      entityId = `queue-${crypto.randomUUID()}`;
      idMapRef.current.set(fingerprint, entityId);
    }

    return {
      ...job,
      entityId,
    };
  });

  // Prune stale fingerprints to keep map size bounded.
  for (const key of idMapRef.current.keys()) {
    if (!seenFingerprints.has(key)) {
      idMapRef.current.delete(key);
    }
  }

  return jobs;
}

function summarizeMetricChanges(previousMetrics, nextMetrics) {
  if (previousMetrics.length === 0 && nextMetrics.length === 0) {
    return "No indices reported.";
  }

  if (nextMetrics.length > previousMetrics.length) {
    return `${nextMetrics.length - previousMetrics.length} index ${nextMetrics.length - previousMetrics.length === 1 ? "added" : "added"}.`;
  }

  if (nextMetrics.length < previousMetrics.length) {
    return `${previousMetrics.length - nextMetrics.length} index ${previousMetrics.length - nextMetrics.length === 1 ? "removed" : "removed"}.`;
  }

  const previousByName = new Map(previousMetrics.map((metric) => [metric.name, metric.health]));
  const changedHealthCount = nextMetrics.filter((metric) => previousByName.get(metric.name) !== undefined && previousByName.get(metric.name) !== metric.health).length;

  if (changedHealthCount > 0) {
    return `${changedHealthCount} index ${changedHealthCount === 1 ? 'health change detected' : 'health changes detected'}.`;
  }

  return 'Metrics refreshed with no index changes.';
}

function summarizeQueueChanges(previousQueue, nextQueue) {
  if (previousQueue.length === 0 && nextQueue.length === 0) {
    return 'Queue is empty.';
  }

  if (nextQueue.length > previousQueue.length) {
    return `${nextQueue.length - previousQueue.length} job ${nextQueue.length - previousQueue.length === 1 ? 'added to queue' : 'added to queue'}.`;
  }

  if (nextQueue.length < previousQueue.length) {
    return `${previousQueue.length - nextQueue.length} job ${previousQueue.length - nextQueue.length === 1 ? 'removed from queue' : 'removed from queue'}.`;
  }

  const previousByIdentity = new Map(previousQueue.map((job) => [getQueueIdentity(job), job.status]));
  const changedStatusCount = nextQueue.filter((job) => {
    const identity = getQueueIdentity(job);
    return identity && previousByIdentity.get(identity) !== undefined && previousByIdentity.get(identity) !== job.status;
  }).length;

  if (changedStatusCount > 0) {
    return `${changedStatusCount} job ${changedStatusCount === 1 ? 'status updated' : 'statuses updated'}.`;
  }

  return 'Queue refreshed with no job changes.';
}

export function useRagApi() {
  const [isConnected, setIsConnected] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [models, setModels] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [queue, setQueue] = useState([]);
  const [metricsState, setMetricsState] = useState({ status: "loading", error: "", lastUpdated: "", changeSummary: "Waiting for metrics." });
  const [queueState, setQueueState] = useState({ status: "loading", error: "", lastUpdated: "", changeSummary: "Waiting for queue updates." });
  const eventSourceRef = useRef(null);
  const chatAbortControllerRef = useRef(null);
  const queueSignatureRef = useRef("[]");
  const queueIdMapRef = useRef(new Map());
  const previousMetricsRef = useRef([]);
  const previousQueueRef = useRef([]);

  // Initialize Models and Connection
  const checkConnection = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/models`);
      if (!res.ok) {
        throw new Error(`Connection check failed with status ${res.status}`);
      }
      const data = await res.json();

      if (data.models) {
        const chatModels = data.models.filter((m) => m.role === "chat");
        setModels(chatModels);
      }
      setIsConnected(true);
      setIsModelReady(!!data.ready);
    } catch (e) {
      setIsConnected(false);
      setIsModelReady(false);
      console.warn("API Connection failed", e.message);
    }
  }, []);

  // Fetch Vector Index Metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/index/metrics`);
      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response));
      }

      const nextMetrics = await response.json();
      setMetrics(nextMetrics);
      setMetricsState({
        status: "ready",
        error: "",
        lastUpdated: nowIsoString(),
        changeSummary: summarizeMetricChanges(previousMetricsRef.current, nextMetrics),
      });
      previousMetricsRef.current = nextMetrics;
    } catch (e) {
      console.error("[Index Monitor Error]", e);
      setMetricsState((current) => ({
        ...current,
        status: "error",
        error: e.message || "Unable to load index metrics.",
      }));
    }
  }, []);

  // Submit Chat Query (Streaming)
  const streamChat = useCallback(async (messages, model, collection, onUpdate) => {
    const emit = (type, payload = {}) => {
      onUpdate?.({ type, ...payload });
    };

    const chatAbortController = new AbortController();
    chatAbortControllerRef.current = chatAbortController;

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, model, collection }),
        signal: chatAbortController.signal,
      });

      if (!response.ok) {
        emit("error", { message: await getResponseErrorMessage(response) });
        return;
      }

      if (!response.body) {
        emit("error", { message: "Streaming response body was empty." });
        return;
      }

      emit("start");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;

          const payload = t.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          try {
            const data = JSON.parse(payload);

            if (data.type === "error") {
              emit("error", { message: data.message || "Server returned an error." });
              return;
            }

            if (data.type === "metadata" && Array.isArray(data.citations)) {
              emit("metadata", { citations: data.citations });
              continue;
            }

            const token = data?.message?.content;
            if (typeof token === "string" && token.length > 0) {
              emit("token", { content: token, raw: data });
            }
          } catch (e) {
            console.error("[Stream Parse Error]", e);
            emit("error", { message: "Received malformed stream data from server." });
            return;
          }
        }
      }

      emit("done");
    } catch (err) {
      if (err?.name === "AbortError") {
        emit("cancelled", {
          message: "Generation cancelled.",
        });
        return;
      }

      emit("error", { message: err.message });
    } finally {
      if (chatAbortControllerRef.current === chatAbortController) {
        chatAbortControllerRef.current = null;
      }
    }
  }, []);

  const cancelStreamChat = useCallback(() => {
    if (!chatAbortControllerRef.current) {
      return false;
    }

    chatAbortControllerRef.current.abort();
    return true;
  }, []);

  // Enqueue Ingestion
  const enqueueJob = useCallback(async (path, collection) => {
    const response = await fetch(`${API_URL}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, collection }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error);
    }
    return response.json();
  }, []);

  // Mount effects
  useEffect(() => {
    checkConnection();
    fetchMetrics();

    // Poll API connection state (10s) so startup races recover automatically.
    const connectionInterval = setInterval(checkConnection, 10000);

    // Polling Index (20s)
    const metricInterval = setInterval(fetchMetrics, 20000);

    // Mount SSE Queue Stream
    eventSourceRef.current = new EventSource(`${API_URL}/queue/stream`);
    eventSourceRef.current.onopen = () => {
      setQueueState((current) => (
        current.status === "loading"
          ? { ...current, status: "ready", error: "" }
          : current
      ));
    };
    eventSourceRef.current.onmessage = (event) => {
      try {
        const jobs = JSON.parse(event.data);
        const nextSignature = JSON.stringify(jobs);
        if (nextSignature === queueSignatureRef.current) {
          setQueueState((current) => (
            current.status === "error"
              ? { ...current, status: "ready", error: "" }
              : current
          ));
          return;
        }

        const normalizedJobs = normalizeQueueJobs(jobs, queueIdMapRef);

        setQueueState({
          status: "ready",
          error: "",
          lastUpdated: nowIsoString(),
          changeSummary: summarizeQueueChanges(previousQueueRef.current, normalizedJobs),
        });
        queueSignatureRef.current = nextSignature;
        previousQueueRef.current = normalizedJobs;
        setQueue(normalizedJobs);
      } catch (e) {
        console.error("Queue SSE Parse", e);
        setQueueState((current) => ({
          ...current,
          status: "error",
          error: "Received malformed queue data.",
        }));
      }
    };
    eventSourceRef.current.onerror = () => {
      setQueueState((current) => ({
        ...current,
        status: "error",
        error: "Live queue updates are unavailable.",
      }));
    };

    return () => {
      clearInterval(connectionInterval);
      clearInterval(metricInterval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (chatAbortControllerRef.current) {
        chatAbortControllerRef.current.abort();
      }
    };
  }, [checkConnection, fetchMetrics]);

  return {
    isConnected,
    isModelReady,
    models,
    metrics,
    queue,
    metricsState,
    queueState,
    streamChat,
    cancelStreamChat,
    enqueueJob,
    fetchMetrics,
  };
}
