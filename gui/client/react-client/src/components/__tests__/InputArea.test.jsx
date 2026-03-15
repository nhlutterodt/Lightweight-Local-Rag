import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import InputArea from "../InputArea";

describe("InputArea", () => {
  it("auto-resizes the textarea and resets height after send", () => {
    const onSend = vi.fn();

    render(<InputArea onSend={onSend} disabled={false} />);

    const textarea = screen.getByLabelText(/query message/i);

    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 96,
    });

    fireEvent.change(textarea, { target: { value: "First line\nSecond line" } });
    expect(textarea.style.height).toBe("96px");

    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 24,
    });

    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(onSend).toHaveBeenCalledWith("First line\nSecond line");
    expect(textarea).toHaveValue("");
    expect(textarea.style.height).toBe("24px");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<InputArea onSend={vi.fn()} disabled={false} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});