import { renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRagApi } from "../useRagApi";

class MockEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.closed = false;
    MockEventSource.instances.push(this);
  }

  emitJson(payload) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(payload) });
    }
  }

  close() {
    this.closed = true;
  }
}

function createStreamingResponse(chunks) {
  let index = 0;

  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) {
              return { done: true, value: undefined };
            }

            const value = new TextEncoder().encode(chunks[index]);
            index += 1;
            return { done: false, value };
          },
        };
      },
    },
  };
}

describe("useRagApi queue equality guard", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    global.EventSource = MockEventSource;
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/models")) {
        return {
          ok: true,
          json: async () => ({ models: [], ready: true }),
        };
      }

      if (String(url).includes("/api/index/metrics")) {
        return {
          ok: true,
          json: async () => [],
        };
      }

      return {
        ok: true,
        json: async () => ({}),
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not update queue state when SSE payload is unchanged", async () => {
    const renderSnapshots = [];

    const { result, unmount } = renderHook(() => {
      const hookState = useRagApi();
      renderSnapshots.push(hookState.queue);
      return hookState;
    });

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    await waitFor(() => {
      expect(result.current.metricsState.status).toBe("ready");
      expect(result.current.isConnected).toBe(true);
    });

    const stream = MockEventSource.instances[0];
    const queuePayload = [{ id: "job-1", status: "pending" }];

    await act(async () => {
      stream.emitJson(queuePayload);
    });

    await waitFor(() => {
      expect(result.current.queue).toMatchObject(queuePayload);
      expect(result.current.queue[0]?.entityId).toBe("job-1");
    });

    const queueRefAfterFirstMessage = result.current.queue;
    await act(async () => {
      stream.emitJson(queuePayload);
      await Promise.resolve();
    });

    expect(result.current.queue).toBe(queueRefAfterFirstMessage);
    expect(result.current.queueState.status).toBe("ready");

    unmount();
    expect(stream.closed).toBe(true);
  });

  it("updates queue state when SSE payload changes", async () => {
    const { result } = renderHook(() => useRagApi());

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    const stream = MockEventSource.instances[0];

    await act(async () => {
      stream.emitJson([{ id: "job-1", status: "pending" }]);
    });

    await waitFor(() => {
      expect(result.current.queue[0]?.status).toBe("pending");
    });

    const previousRef = result.current.queue;

    await act(async () => {
      stream.emitJson([{ id: "job-1", status: "completed" }]);
    });

    await waitFor(() => {
      expect(result.current.queue[0]?.status).toBe("completed");
    });

    expect(result.current.queue).not.toBe(previousRef);
  });

  it("captures before/after render metrics for 100 identical queue messages", async () => {
    const renderSnapshots = [];

    renderHook(() => {
      const hookState = useRagApi();
      renderSnapshots.push(hookState.queue);
      return hookState;
    });

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    const stream = MockEventSource.instances[0];
    const queuePayload = [{ id: "job-1", status: "pending" }];
    const baselineQueueStateUpdates = 100;
    const renderCountBeforeBurst = renderSnapshots.length;

    await act(async () => {
      for (let i = 0; i < 100; i += 1) {
        stream.emitJson(queuePayload);
      }
      await Promise.resolve();
    });

    const optimizedQueueStateUpdates =
      renderSnapshots.length - renderCountBeforeBurst;

    expect(optimizedQueueStateUpdates).toBe(1);
    expect(optimizedQueueStateUpdates).toBeLessThan(baselineQueueStateUpdates);

    console.log("[Queue Render Metrics]", {
      baselineQueueStateUpdates,
      optimizedQueueStateUpdates,
    });
  });

  it("treats field-order-only payload differences as distinct by contract", async () => {
    const renderSnapshots = [];

    const { result } = renderHook(() => {
      const hookState = useRagApi();
      renderSnapshots.push(hookState.queue);
      return hookState;
    });

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    const stream = MockEventSource.instances[0];
    const firstPayload = [{ id: "job-1", status: "pending" }];
    const sameSemanticsDifferentOrder = [{ status: "pending", id: "job-1" }];

    await act(async () => {
      stream.emitJson(firstPayload);
    });

    await waitFor(() => {
      expect(result.current.queue).toMatchObject(firstPayload);
    });

    const afterFirstRef = result.current.queue;
    const rendersBeforeSecond = renderSnapshots.length;

    await act(async () => {
      stream.emitJson(sameSemanticsDifferentOrder);
    });

    await waitFor(() => {
      expect(result.current.queue).toMatchObject(sameSemanticsDifferentOrder);
    });

    expect(result.current.queue).not.toBe(afterFirstRef);
    expect(renderSnapshots.length).toBeGreaterThan(rendersBeforeSecond);
  });
});

describe("useRagApi streamChat", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    global.EventSource = MockEventSource;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits start, token, and done events for a valid stream", async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/models")) {
        return {
          ok: true,
          json: async () => ({ models: [], ready: true }),
        };
      }

      if (String(url).includes("/api/index/metrics")) {
        return {
          ok: true,
          json: async () => [],
        };
      }

      if (String(url).includes("/api/chat")) {
        return createStreamingResponse([
          'data: {"message":{"content":"Hello "}}\n',
          'data: {"message":{"content":"world"}}\n',
        ]);
      }

      return {
        ok: true,
        json: async () => ({}),
      };
    });

    const { result } = renderHook(() => useRagApi());
    const onUpdate = vi.fn();

    await act(async () => {
      await result.current.streamChat(
        [{ role: "user", content: "Hi" }],
        "llama3",
        "Docs",
        onUpdate,
      );
    });

    expect(onUpdate.mock.calls.map(([event]) => event.type)).toEqual([
      "start",
      "token",
      "token",
      "done",
    ]);
    expect(onUpdate.mock.calls[1][0]).toMatchObject({
      type: "token",
      content: "Hello ",
    });
  });

  it("emits an error event for non-200 chat responses", async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/models")) {
        return {
          ok: true,
          json: async () => ({ models: [], ready: true }),
        };
      }

      if (String(url).includes("/api/index/metrics")) {
        return {
          ok: true,
          json: async () => [],
        };
      }

      if (String(url).includes("/api/chat")) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ message: "Backend unavailable" }),
        };
      }

      return {
        ok: true,
        json: async () => ({}),
      };
    });

    const { result } = renderHook(() => useRagApi());
    const onUpdate = vi.fn();

    await act(async () => {
      await result.current.streamChat(
        [{ role: "user", content: "Hi" }],
        "llama3",
        "Docs",
        onUpdate,
      );
    });

    expect(onUpdate).toHaveBeenCalledWith({
      type: "error",
      message: "Backend unavailable",
    });
  });

  it("emits an error event when the stream contains malformed JSON", async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/models")) {
        return {
          ok: true,
          json: async () => ({ models: [], ready: true }),
        };
      }

      if (String(url).includes("/api/index/metrics")) {
        return {
          ok: true,
          json: async () => [],
        };
      }

      if (String(url).includes("/api/chat")) {
        return createStreamingResponse([
          'data: {"message":{"content":"Hello"}}\n',
          'data: {not-json}\n',
        ]);
      }

      return {
        ok: true,
        json: async () => ({}),
      };
    });

    const { result } = renderHook(() => useRagApi());
    const onUpdate = vi.fn();

    await act(async () => {
      await result.current.streamChat(
        [{ role: "user", content: "Hi" }],
        "llama3",
        "Docs",
        onUpdate,
      );
    });

    expect(onUpdate.mock.calls.map(([event]) => event.type)).toEqual([
      "start",
      "token",
      "error",
    ]);
    expect(onUpdate.mock.calls[2][0]).toMatchObject({
      type: "error",
      message: "Received malformed stream data from server.",
    });
  });

  it("emits cancelled when the chat stream is aborted", async () => {
    global.fetch = vi.fn(async (url, options) => {
      if (String(url).includes("/api/models")) {
        return {
          ok: true,
          json: async () => ({ models: [], ready: true }),
        };
      }

      if (String(url).includes("/api/index/metrics")) {
        return {
          ok: true,
          json: async () => [],
        };
      }

      if (String(url).includes("/api/chat")) {
        return new Promise((_, reject) => {
          options.signal.addEventListener("abort", () => {
            const abortError = new Error("Aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        });
      }

      return {
        ok: true,
        json: async () => ({}),
      };
    });

    const { result } = renderHook(() => useRagApi());
    const onUpdate = vi.fn();

    const streamPromise = result.current.streamChat(
      [{ role: "user", content: "Hi" }],
      "llama3",
      "Docs",
      onUpdate,
    );

    await act(async () => {
      expect(result.current.cancelStreamChat()).toBe(true);
    });

    await act(async () => {
      await streamPromise;
    });

    expect(onUpdate).toHaveBeenCalledWith({
      type: "cancelled",
      message: "Generation cancelled.",
    });
    expect(result.current.cancelStreamChat()).toBe(false);
  });
});
