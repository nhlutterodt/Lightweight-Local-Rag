import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import App from "./App";

let mockStreamChat = vi.fn();
let mockCancelStreamChat = vi.fn();
let mockEnqueueJob = vi.fn();

vi.mock("./hooks/useRagApi", () => ({
  useRagApi: () => ({
    isConnected: true,
    isModelReady: true,
    models: [{ name: "llama3", size: 1024 }],
    metrics: [],
    queue: [],
    metricsState: {
      status: "ready",
      error: "",
      lastUpdated: "2026-03-15T11:00:00.000Z",
      changeSummary: "Metrics refreshed with no index changes.",
    },
    queueState: {
      status: "ready",
      error: "",
      lastUpdated: "2026-03-15T11:00:00.000Z",
      changeSummary: "Queue is empty.",
    },
    streamChat: mockStreamChat,
    cancelStreamChat: mockCancelStreamChat,
    enqueueJob: mockEnqueueJob,
  }),
}));

describe("App", () => {
  beforeEach(() => {
    mockStreamChat = vi.fn();
    mockCancelStreamChat = vi.fn();
    mockEnqueueJob = vi.fn();
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        currentPath: "/allowed/root",
        parentPath: "/allowed",
        contents: [
          { name: "Folder A", isDirectory: true, path: "/allowed/root/Folder A" },
          { name: "file.txt", isDirectory: false, path: "/allowed/root/file.txt" },
        ],
      }),
    });
  });

  it("renders a skip link to the chat input", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: /skip to chat input/i })).toHaveAttribute("href", "#userInput");
  });

  it("restores light theme preference from localStorage", () => {
    window.localStorage.setItem("rag.ui.theme", "light");

    render(<App />);

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("has no detectable accessibility violations in the initial shell", async () => {
    const { container } = render(<App />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows retry UI when a response fails before the stream starts", async () => {
    const user = userEvent.setup();
    mockStreamChat.mockImplementation(async (_messages, _model, _collection, onUpdate) => {
      onUpdate({ type: "error", message: "Backend unavailable" });
    });

    render(<App />);

    await user.type(screen.getByLabelText(/query message/i), "Why did this fail?");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText(/response could not start/i)).toBeInTheDocument();
    expect(screen.getByText(/backend unavailable/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry response/i }));

    expect(mockStreamChat).toHaveBeenCalledTimes(2);
  });

  it("shows interrupted recovery UI when a response fails mid-stream", async () => {
    const user = userEvent.setup();
    mockStreamChat.mockImplementation(async (_messages, _model, _collection, onUpdate) => {
      onUpdate({ type: "start" });
      onUpdate({ type: "token", content: "Partial answer" });
      onUpdate({ type: "error", message: "Connection lost" });
    });

    render(<App />);

    await user.type(screen.getByLabelText(/query message/i), "Continue please");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText(/response interrupted/i)).toBeInTheDocument();
    expect(screen.getByText(/partial answer/i)).toBeInTheDocument();
    expect(screen.getByText(/connection lost/i)).toBeInTheDocument();
  });

  it("cancels generation explicitly from the input action", async () => {
    const user = userEvent.setup();
    let onUpdateRef;

    mockStreamChat.mockImplementation(async (_messages, _model, _collection, onUpdate) => {
      onUpdateRef = onUpdate;
      onUpdate({ type: "start" });
      return new Promise(() => {});
    });

    mockCancelStreamChat.mockImplementation(() => {
      onUpdateRef?.({ type: "cancelled", message: "Generation cancelled." });
      return true;
    });

    render(<App />);

    await user.type(screen.getByLabelText(/query message/i), "Cancel this");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await user.click(screen.getByRole("button", { name: /stop generation/i }));

    expect(mockCancelStreamChat).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/response cancelled/i)).toBeInTheDocument();
  });

  it("cancels and clears the session when clear is pressed during generation", async () => {
    const user = userEvent.setup();
    let onUpdateRef;

    mockStreamChat.mockImplementation(async (_messages, _model, _collection, onUpdate) => {
      onUpdateRef = onUpdate;
      onUpdate({ type: "start" });
      return new Promise(() => {});
    });

    mockCancelStreamChat.mockImplementation(() => {
      onUpdateRef?.({ type: "cancelled", message: "Generation cancelled." });
      return true;
    });

    render(<App />);

    await user.type(screen.getByLabelText(/query message/i), "Clear while running");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await user.click(screen.getByRole("button", { name: /stop & clear session/i }));

    expect(mockCancelStreamChat).toHaveBeenCalledTimes(1);
    expect((await screen.findAllByText(/generation cancelled and session cleared/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/clear while running/i)).not.toBeInTheDocument();
  });

  it("supports undo after clearing a completed session", async () => {
    const user = userEvent.setup();
    mockStreamChat.mockImplementation(async (_messages, _model, _collection, onUpdate) => {
      onUpdate({ type: "start" });
      onUpdate({ type: "token", content: "Answer body" });
      onUpdate({ type: "done" });
    });

    render(<App />);

    await user.type(screen.getByLabelText(/query message/i), "Keep this history");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText(/answer body/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear session/i }));

    expect(await screen.findByRole("button", { name: /undo clear/i })).toBeInTheDocument();
    expect(screen.queryByText(/keep this history/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /undo clear/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /undo clear/i })).not.toBeInTheDocument();
    });
    expect(screen.getByText(/keep this history/i)).toBeInTheDocument();
    expect(screen.getByText(/answer body/i)).toBeInTheDocument();
  });

  it("shows action-linked queue confirmation in analytics after enqueue", async () => {
    const user = userEvent.setup();
    mockEnqueueJob.mockResolvedValue({ id: "job-123" });

    render(<App />);

    await user.type(screen.getByLabelText(/vectorize new data/i), "C:/Docs/Notes.md");
    await user.click(screen.getByRole("button", { name: /queue/i }));

    expect(await screen.findByText(/queued notes\.md for collection testingest\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view queued job/i })).toBeInTheDocument();
  });

  it("supports a keyboard journey from sidebar to modal and back to the chat input", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.tab();
    expect(screen.getByRole("link", { name: /skip to chat input/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/ai model/i)).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/collection/i)).toHaveFocus();

    await user.tab();
    const ingestInput = screen.getByLabelText(/vectorize new data/i);
    expect(ingestInput).toHaveFocus();
    await user.type(ingestInput, "C:/Docs");

    await user.tab();
    const browseButton = screen.getByRole("button", { name: /browse for a folder/i });
    expect(browseButton).toHaveFocus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog", { name: /select folder/i });
    expect(screen.getByRole("button", { name: /close folder browser/i })).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /select folder/i })).not.toBeInTheDocument();
    });
    expect(browseButton).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /queue/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/clear path after successful queue/i)).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /clear session/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/query message/i)).toHaveFocus();
  });
});