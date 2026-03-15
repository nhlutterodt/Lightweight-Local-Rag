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
            content:
              'Hello<script>alert("xss")</script><img src="x" onerror="alert(1)" /><think>Internal reasoning</think>',
          },
        ]}
        isGenerating={false}
      />,
    );

    expect(screen.getByRole("log", { name: /conversation history/i })).toBeInTheDocument();
    expect(screen.getByText(/reasoning process/i)).toBeInTheDocument();
    expect(screen.getByText(/internal reasoning/i)).toBeInTheDocument();
    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toHaveAttribute("onerror");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(
      <ChatWindow
        history={[{ role: "user", content: "Question" }, { role: "ai", content: "Answer" }]}
        isGenerating={false}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});