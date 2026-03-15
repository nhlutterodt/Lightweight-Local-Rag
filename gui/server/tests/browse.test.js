import { jest } from "@jest/globals";
import request from "supertest";
import path from "path";
import os from "os";
import fs from "fs";

const TEST_ALLOWED_ROOT = path.join(os.tmpdir(), "rag-browse-test-root");
process.env.ALLOWED_BROWSE_ROOTS = TEST_ALLOWED_ROOT;

// Set up the filesystem for the test
beforeAll(() => {
  fs.mkdirSync(TEST_ALLOWED_ROOT, { recursive: true });
  fs.mkdirSync(path.join(TEST_ALLOWED_ROOT, "Folder A"));
  fs.mkdirSync(path.join(TEST_ALLOWED_ROOT, "Folder B"));
  fs.writeFileSync(path.join(TEST_ALLOWED_ROOT, "file1.txt"), "hello");
  fs.writeFileSync(path.join(TEST_ALLOWED_ROOT, ".hidden"), "secret");
});

afterAll(() => {
  fs.rmSync(TEST_ALLOWED_ROOT, { recursive: true, force: true });
});

// Mock child_process map
jest.unstable_mockModule("child_process", () => ({
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn(),
  })),
}));

const appModule = await import("../server.js");
const app = appModule.default;

describe("GET /api/browse API", () => {
  it("should default to first allowed root when path query is omitted", async () => {
    const res = await request(app).get("/api/browse");

    expect(res.statusCode).toBe(200);
    expect(res.body.currentPath).toBe(TEST_ALLOWED_ROOT);
  });

  it("should return the contents of the requested directory", async () => {
    const res = await request(app).get(
      `/api/browse?path=${encodeURIComponent(TEST_ALLOWED_ROOT)}`,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.currentPath).toBe(TEST_ALLOWED_ROOT);
    expect(res.body.contents.length).toBe(3); // Folder A, Folder B, file1.txt

    // Folders come first
    expect(res.body.contents[0].name).toBe("Folder A");
    expect(res.body.contents[0].isDirectory).toBe(true);

    expect(res.body.contents[1].name).toBe("Folder B");
    expect(res.body.contents[1].isDirectory).toBe(true);

    expect(res.body.contents[2].name).toBe("file1.txt");
    expect(res.body.contents[2].isDirectory).toBe(false);
  });

  it("should filter out hidden files starting with .", async () => {
    const res = await request(app).get(
      `/api/browse?path=${encodeURIComponent(TEST_ALLOWED_ROOT)}`,
    );
    const names = res.body.contents.map((c) => c.name);
    expect(names).not.toContain(".hidden");
  });

  it("should reject paths outside ALLOWED_BROWSE_ROOTS with 403", async () => {
    const disallowed = path.join(os.tmpdir(), "some-other-dir");
    const res = await request(app).get(
      `/api/browse?path=${encodeURIComponent(disallowed)}`,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("BROWSE_PATH_RESTRICTED");
    expect(res.body.message).toMatch(/restricted/i);
  });

  it("should reject sibling-prefix path escapes", async () => {
    const siblingPrefix = `${TEST_ALLOWED_ROOT}_evil`;
    fs.mkdirSync(siblingPrefix, { recursive: true });

    const res = await request(app).get(
      `/api/browse?path=${encodeURIComponent(siblingPrefix)}`,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("BROWSE_PATH_RESTRICTED");

    fs.rmSync(siblingPrefix, { recursive: true, force: true });
  });

  it("should reject symlink or junction paths inside allowed roots", async () => {
    const sourceDir = path.join(TEST_ALLOWED_ROOT, "Folder A");
    const linkedDir = path.join(TEST_ALLOWED_ROOT, "Linked Folder");

    try {
      if (process.platform === "win32") {
        fs.symlinkSync(sourceDir, linkedDir, "junction");
      } else {
        fs.symlinkSync(sourceDir, linkedDir, "dir");
      }
    } catch {
      // Some CI environments do not permit symlink creation.
      return;
    }

    const res = await request(app).get(
      `/api/browse?path=${encodeURIComponent(linkedDir)}`,
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("BROWSE_PATH_RESTRICTED");

    fs.rmSync(linkedDir, { recursive: true, force: true });
  });

  it("should reject non-existent directories with restricted-path response", async () => {
    const nonExistent = path.join(TEST_ALLOWED_ROOT, "does-not-exist");
    const res = await request(app).get(
      `/api/browse?path=${encodeURIComponent(nonExistent)}`,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("BROWSE_PATH_RESTRICTED");
  });
});
