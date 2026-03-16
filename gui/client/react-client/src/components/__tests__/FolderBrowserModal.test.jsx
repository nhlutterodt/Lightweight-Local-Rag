import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { vi } from "vitest";
import FolderBrowserModal from "../FolderBrowserModal";

function mockBrowseResponse({ currentPath = "/allowed/root", parentPath = null, contents = [] } = {}) {
  return {
    ok: true,
    json: async () => ({ currentPath, parentPath, contents }),
  };
}

function ModalHarness() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open Browser
      </button>
      <FolderBrowserModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={vi.fn()}
        initialPath="/allowed/root"
      />
    </>
  );
}

describe("FolderBrowserModal", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(
      mockBrowseResponse({
        currentPath: "/allowed/root",
        parentPath: "/allowed",
        contents: [
          {
            name: "Folder A",
            isDirectory: true,
            path: "/allowed/root/Folder A",
          },
          {
            name: "file.txt",
            isDirectory: false,
            path: "/allowed/root/file.txt",
          },
        ],
      }),
    );
  });

  it("supports keyboard navigation and Enter to open selected folder", async () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();

    render(
      <FolderBrowserModal
        isOpen={true}
        onClose={onClose}
        onSelect={onSelect}
        initialPath="/allowed/root"
      />,
    );

    await screen.findByText(/Folder A/);
    const listbox = screen.getByRole("listbox", { name: /directory contents/i });

    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "Enter" });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const secondCallUrl = new URL(global.fetch.mock.calls[1][0]);
    expect(secondCallUrl.searchParams.get("path")).toBe("/allowed/root/Folder A");
  });

  it("exposes listbox option semantics with active descendant and selected option", async () => {
    render(
      <FolderBrowserModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        initialPath="/allowed/root"
      />,
    );

    await screen.findByText(/Folder A/);

    const listbox = screen.getByRole("listbox", { name: /directory contents/i });
    const options = screen.getAllByRole("option");

    expect(options).toHaveLength(3);
    expect(listbox).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(listbox, { key: "ArrowDown" });

    expect(listbox).toHaveAttribute("aria-activedescendant", options[1].id);
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();

    render(
      <FolderBrowserModal
        isOpen={true}
        onClose={onClose}
        onSelect={vi.fn()}
        initialPath="/allowed/root"
      />,
    );

    await screen.findByText(/Folder A/);
    fireEvent.keyDown(screen.getByRole("dialog", { name: /select folder/i }), {
      key: "Escape",
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog and restores it to the trigger when closed", async () => {
    render(<ModalHarness />);

    const openButton = screen.getByRole("button", { name: /open browser/i });
    openButton.focus();
    fireEvent.click(openButton);

    const closeButton = await screen.findByRole("button", {
      name: /close folder browser/i,
    });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("dialog", { name: /select folder/i }), {
      key: "Escape",
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /select folder/i })).not.toBeInTheDocument();
    });
    expect(openButton).toHaveFocus();
  });

  it("has no detectable accessibility violations when open", async () => {
    const { container } = render(
      <FolderBrowserModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        initialPath="/allowed/root"
      />,
    );

    await screen.findByText(/Folder A/);

    expect(await axe(container)).toHaveNoViolations();
  });
});
