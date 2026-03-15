import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import FolderBrowserModal from "../FolderBrowserModal";

function mockBrowseResponse({ currentPath = "/allowed/root", parentPath = null, contents = [] } = {}) {
  return {
    ok: true,
    json: async () => ({ currentPath, parentPath, contents }),
  };
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
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const secondCallUrl = new URL(global.fetch.mock.calls[1][0]);
    expect(secondCallUrl.searchParams.get("path")).toBe("/allowed/root/Folder A");
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
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
