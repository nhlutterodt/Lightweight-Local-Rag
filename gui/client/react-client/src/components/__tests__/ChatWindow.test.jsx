import { render, screen, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import ChatWindow from "../ChatWindow";

describe("ChatWindow", () => {
  it("auto-scrolls to the latest message when history updates", async () => {
    const originalMatchMedia = window.matchMedia;
    const scrollIntoView = vi.fn();

    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() });
    Element.prototype.scrollIntoView = scrollIntoView;

    const { rerender } = render(<ChatWindow history={[]} isGenerating={false} />);

    rerender(
      <ChatWindow
        history={[{ role: "user", content: "Hello" }]}
        isGenerating={false}
      />,
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "end" });
    });

    window.matchMedia = originalMatchMedia;
  });

  it("sanitizes AI-rendered HTML and exposes the chat log live region", () => {
    const { container } = render(
      <ChatWindow
        history={[
          {
            role: "ai",
            createdAt: "2026-03-15T12:00:00.000Z",
            content:
              'Hello<script>alert("xss")</script><img src="x" onerror="alert(1)" /><think>Internal reasoning</think>',
            citations: [
              {
                fileName: "Architecture_Design.md",
                headerContext: "Section > Overview",
                score: 0.92,
                preview: "System architecture details...",
              },
            ],
          },
        ]}
        isGenerating={false}
      />,
    );

    expect(screen.getByRole("log", { name: /conversation history/i })).toBeInTheDocument();
    expect(screen.getByText(/architecture_design\.md/i)).toBeInTheDocument();
    expect(screen.getByText(/relevance: 92%/i)).toBeInTheDocument();
    expect(screen.getByText(/section > overview/i)).toBeInTheDocument();
    expect(screen.getByText(/system architecture details/i)).toBeInTheDocument();
    expect(screen.getByText(/2026/i)).toBeInTheDocument();
    expect(screen.getByText(/reasoning process/i)).toBeInTheDocument();
    expect(screen.getByText(/internal reasoning/i)).toBeInTheDocument();
    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toHaveAttribute("onerror");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(
      <ChatWindow
        history={[
          { role: "user", content: "Question", createdAt: "2026-03-15T12:00:00.000Z" },
          { role: "ai", content: "Answer", createdAt: "2026-03-15T12:00:05.000Z" },
        ]}
        isGenerating={false}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("emits a performance advisory for long chat histories over threshold", async () => {
    const onPerformanceSignal = vi.fn();
    const nowProvider = vi.fn();
    const history = Array.from({ length: 80 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "ai",
      content: `Message ${index + 1}`,
      citations: index % 2 === 0 ? [] : [{ fileName: `Doc-${index}` }],
    }));

    nowProvider.mockReturnValueOnce(0);
    nowProvider.mockReturnValueOnce(45);

    render(
      <ChatWindow
        history={history}
        isGenerating={false}
        onPerformanceSignal={onPerformanceSignal}
        nowProvider={nowProvider}
      />,
    );

    await waitFor(() => {
      expect(onPerformanceSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "info",
          messageCount: 80,
          thresholdMs: 32,
        }),
      );
    });
  });
});