import { render, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import Sidebar from "../Sidebar";

function renderSidebar(overrides = {}) {
  const defaults = {
    models: [{ name: "llama3", size: 1024 }],
    activeModel: "llama3",
    setActiveModel: vi.fn(),
    isConnected: true,
    isModelReady: true,
    metrics: [],
    queue: [],
    isWide: true,
    onEnqueue: vi.fn().mockResolvedValue({ id: "job-1" }),
    onClearSession: vi.fn(),
  };

  const props = { ...defaults, ...overrides };
  const result = render(<Sidebar {...props} />);
  return { ...result, props };
}

describe("Sidebar persistence", () => {
  it("hydrates ingest path and collection from localStorage", () => {
    window.localStorage.setItem("rag.sidebar.collection", "SavedCollection");
    window.localStorage.setItem("rag.sidebar.ingestPath", "C:/SavedPath");

    const { container } = renderSidebar();
    const collectionInput = container.querySelector("#collectionName");
    const ingestInput = container.querySelector("#ingestPath");

    expect(collectionInput.value).toBe("SavedCollection");
    expect(ingestInput.value).toBe("C:/SavedPath");
  });

  it("persists updated path and collection values", async () => {
    const { container } = renderSidebar();
    const collectionInput = container.querySelector("#collectionName");
    const ingestInput = container.querySelector("#ingestPath");

    fireEvent.change(collectionInput, { target: { value: "NewCollection" } });
    fireEvent.change(ingestInput, { target: { value: "C:/Docs" } });

    await waitFor(() => {
      expect(window.localStorage.getItem("rag.sidebar.collection")).toBe("NewCollection");
      expect(window.localStorage.getItem("rag.sidebar.ingestPath")).toBe("C:/Docs");
    });
  });

  it("keeps path by default and stores recent history after successful enqueue", async () => {
    const { container, props } = renderSidebar();
    const collectionInput = container.querySelector("#collectionName");
    const ingestInput = container.querySelector("#ingestPath");
    const queueButton = container.querySelector("#enqueueIngest");

    fireEvent.change(collectionInput, { target: { value: "PersistedCollection" } });
    fireEvent.change(ingestInput, { target: { value: "C:/PersistedPath" } });
    fireEvent.click(queueButton);

    await waitFor(() => {
      expect(props.onEnqueue).toHaveBeenCalledWith("C:/PersistedPath", "PersistedCollection");
    });

    expect(container.querySelector("#ingestPath").value).toBe("C:/PersistedPath");

    await waitFor(() => {
      const recentPaths = JSON.parse(window.localStorage.getItem("rag.sidebar.recentPaths") || "[]");
      const recentCollections = JSON.parse(window.localStorage.getItem("rag.sidebar.recentCollections") || "[]");
      expect(recentPaths).toContain("C:/PersistedPath");
      expect(recentCollections).toContain("PersistedCollection");
    });
  });

  it("clears path after enqueue when clear option is enabled", async () => {
    const { container } = renderSidebar();
    const ingestInput = container.querySelector("#ingestPath");
    const queueButton = container.querySelector("#enqueueIngest");
    const clearCheckbox = container.querySelector("input[type='checkbox']");

    fireEvent.change(ingestInput, { target: { value: "C:/ToClear" } });
    fireEvent.click(clearCheckbox);
    fireEvent.click(queueButton);

    await waitFor(() => {
      expect(container.querySelector("#ingestPath").value).toBe("");
    });
  });
});
