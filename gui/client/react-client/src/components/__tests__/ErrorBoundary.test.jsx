import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import ErrorBoundary from "../ErrorBoundary";

function ThrowingSection({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error("Boom");
  }

  return <div>Section content</div>;
}

function ErrorBoundaryHarness() {
  const [shouldThrow, setShouldThrow] = useState(true);

  return (
    <>
      <button type="button" onClick={() => setShouldThrow(false)}>
        Resolve error
      </button>
      <ErrorBoundary title="Chat workspace unavailable" message="Retry this section.">
        <ThrowingSection shouldThrow={shouldThrow} />
      </ErrorBoundary>
    </>
  );
}

describe("ErrorBoundary", () => {
  it("renders a fallback and can retry the section", async () => {
    const user = userEvent.setup();

    render(<ErrorBoundaryHarness />);

    expect(screen.getByRole("alert")).toHaveTextContent(/chat workspace unavailable/i);

    await user.click(screen.getByRole("button", { name: /resolve error/i }));
    await user.click(screen.getByRole("button", { name: /retry section/i }));

    expect(screen.getByText(/section content/i)).toBeInTheDocument();
  });
});