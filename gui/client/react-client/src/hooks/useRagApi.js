import { useState, useEffect, useCallback, useRef } from "react";

const API_URL = "http://localhost:3001/api";

export function useRagApi() {
  const [isConnected, setIsConnected] = useState(false);
  const [models, setModels] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [queue, setQueue] = useState([]);
  const eventSourceRef = useRef(null);

  // Initialize Models and Connection
  const checkConnection = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/models`);
      const data = await res.json();

      if (data.models) {
        const chatModels = data.models.filter((m) => m.role === "chat");
        setModels(chatModels);
      }
      setIsConnected(!!data.ready);
    } catch (e) {
      setIsConnected(false);
      console.warn("API Connection failed", e.message);
    }
  }, []);

  // Fetch Vector Index Metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/index/metrics`);
      if (response.ok) {
        setMetrics(await response.json());
      }
    } catch (e) {
      console.error("[Index Monitor Error]", e);
    }
  }, []);

  // Submit Chat Query (Streaming)
  const streamChat = async (messages, model, collection, onUpdate) => {
    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, model, collection }),
      });

      if (!response.ok) throw new Error(`Server returned ${response.status}`);

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
          if (!t.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(t.slice(6));
            onUpdate(data);
          } catch (e) {
            if (t.includes('{"model":')) continue;
            console.error("[Stream Parse Error]", e);
          }
        }
      }
    } catch (err) {
      onUpdate({ error: err.message });
    }
  };

  // Enqueue Ingestion
  const enqueueJob = async (path, collection) => {
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
  };

  // Mount effects
  useEffect(() => {
    checkConnection();
    fetchMetrics();

    // Polling Index (20s)
    const metricInterval = setInterval(fetchMetrics, 20000);

    // Mount SSE Queue Stream
    eventSourceRef.current = new EventSource(`${API_URL}/queue/stream`);
    eventSourceRef.current.onmessage = (event) => {
      try {
        const jobs = JSON.parse(event.data);
        setQueue(jobs);
      } catch (e) {
        console.error("Queue SSE Parse", e);
      }
    };

    return () => {
      clearInterval(metricInterval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [checkConnection, fetchMetrics]);

  return {
    isConnected,
    models,
    metrics,
    queue,
    streamChat,
    enqueueJob,
    fetchMetrics,
  };
}
