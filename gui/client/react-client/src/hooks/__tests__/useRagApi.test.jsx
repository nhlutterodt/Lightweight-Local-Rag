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

    const stream = MockEventSource.instances[0];
    const queuePayload = [{ id: "job-1", status: "pending" }];

    await act(async () => {
      stream.emitJson(queuePayload);
    });

    await waitFor(() => {
      expect(result.current.queue).toEqual(queuePayload);
    });

    const queueRefAfterFirstMessage = result.current.queue;
    const rendersBeforeDuplicate = renderSnapshots.length;

    await act(async () => {
      stream.emitJson(queuePayload);
      await Promise.resolve();
    });

    expect(result.current.queue).toBe(queueRefAfterFirstMessage);
    expect(renderSnapshots.length).toBe(rendersBeforeDuplicate);

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
      expect(result.current.queue).toEqual(firstPayload);
    });

    const afterFirstRef = result.current.queue;
    const rendersBeforeSecond = renderSnapshots.length;

    await act(async () => {
      stream.emitJson(sameSemanticsDifferentOrder);
    });

    await waitFor(() => {
      expect(result.current.queue).toEqual(sameSemanticsDifferentOrder);
    });

    expect(result.current.queue).not.toBe(afterFirstRef);
    expect(renderSnapshots.length).toBeGreaterThan(rendersBeforeSecond);
  });
});
