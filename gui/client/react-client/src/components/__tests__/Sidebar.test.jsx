import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import Sidebar from "../Sidebar";

function renderSidebar(overrides = {}) {
  const defaults = {
    models: [{ name: "llama3", size: 1024 }],
    activeModel: "llama3",
    setActiveModel: vi.fn(),
    collectionName: "TestIngest",
    setCollectionName: vi.fn(),
    isConnected: true,
    isModelReady: true,
    onEnqueue: vi.fn().mockResolvedValue({ id: "job-1" }),
    onClearSession: vi.fn(),
  };

  const props = { ...defaults, ...overrides };
  const result = render(<Sidebar {...props} />);
  return { ...result, props };
}

describe("Sidebar", () => {
  it("hydrates ingest path from localStorage and exposes accessible labels", () => {
    window.localStorage.setItem("rag.sidebar.ingestPath", "C:/SavedPath");

    renderSidebar();
    const collectionInput = screen.getByLabelText(/collection/i);
    const ingestInput = screen.getByLabelText(/vectorize new data/i);
    const statusRegion = screen.getByRole("status");

    expect(collectionInput).toHaveValue("TestIngest");
    expect(ingestInput.value).toBe("C:/SavedPath");
    expect(screen.getByLabelText(/ai model/i)).toBeInTheDocument();
    expect(statusRegion).toHaveTextContent(/system online/i);
  });

  it("calls setCollectionName when the collection input changes", () => {
    const { props } = renderSidebar();

    fireEvent.change(screen.getByLabelText(/collection/i), {
      target: { value: "NewCollection" },
    });

    expect(props.setCollectionName).toHaveBeenCalledWith("NewCollection");
  });

  it("keeps path by default and stores recent history after successful enqueue", async () => {
    const { props } = renderSidebar({ collectionName: "PersistedCollection" });
    const ingestInput = screen.getByLabelText(/vectorize new data/i);
    const queueButton = screen.getByRole("button", { name: /queue/i });

    fireEvent.change(ingestInput, { target: { value: "C:/PersistedPath" } });
    fireEvent.click(queueButton);

    await waitFor(() => {
      expect(props.onEnqueue).toHaveBeenCalledWith("C:/PersistedPath", "PersistedCollection");
    });

    expect(screen.getByLabelText(/vectorize new data/i)).toHaveValue("C:/PersistedPath");

    await waitFor(() => {
      const recentPaths = JSON.parse(window.localStorage.getItem("rag.sidebar.recentPaths") || "[]");
      const recentCollections = JSON.parse(window.localStorage.getItem("rag.sidebar.recentCollections") || "[]");
      expect(recentPaths).toContain("C:/PersistedPath");
      expect(recentCollections).toContain("PersistedCollection");
    });
  });

  it("clears path after enqueue when clear option is enabled", async () => {
    renderSidebar();
    const ingestInput = screen.getByLabelText(/vectorize new data/i);
    const queueButton = screen.getByRole("button", { name: /queue/i });
    const clearCheckbox = screen.getByLabelText(/clear path after successful queue/i);

    fireEvent.change(ingestInput, { target: { value: "C:/ToClear" } });
    fireEvent.click(clearCheckbox);
    fireEvent.click(queueButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/vectorize new data/i)).toHaveValue("");
    });
  });

  it("shows undo clear action when undo state is available", () => {
    const onUndoClear = vi.fn();
    renderSidebar({ canUndoClear: true, onUndoClear });

    fireEvent.click(screen.getByRole("button", { name: /undo clear/i }));

    expect(onUndoClear).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/session cleared/i)).toBeInTheDocument();
  });
});
