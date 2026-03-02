import { jest } from "@jest/globals";
import request from "supertest";
import path from "path";
import os from "os";

// Define an explicit allowed root for testing BEFORE importing server.js
const TEST_ALLOWED_ROOT = path.join(os.tmpdir(), "rag-allowed-root");
process.env.ALLOWED_BROWSE_ROOTS = TEST_ALLOWED_ROOT;

// Mock child_process — spawn still used by PowerShellRunner
jest.unstable_mockModule("child_process", () => ({
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn(),
  })),
}));

// Mock IngestionQueue enqueue so we don't start real ingestion jobs
jest.unstable_mockModule("../IngestionQueue.js", () => {
  return {
    default: class MockIngestionQueue {
      constructor() {}
      on() {}
      getJobs() {
        return [];
      }
      enqueue() {
        return { id: "mock-job-id" };
      }
      cancelJob() {
        return true;
      }
      setConfig() {}
    },
  };
});

const appModule = await import("../server.js");
const app = appModule.default;

describe("Security Controls", () => {
  describe("Path Traversal Protection (isSafePath)", () => {
    it("should reject paths outside ALLOWED_BROWSE_ROOTS", async () => {
      const res = await request(app)
        .post("/api/queue")
        .send({
          path: path.join(os.tmpdir(), "disallowed-root", "folder"),
          collection: "test",
        });
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/Unsafe or restricted input path/);
    });

    it("should reject absolute paths matching old blocked roots natively", async () => {
      const res = await request(app).post("/api/queue").send({
        path: "C:\\Windows\\System32",
        collection: "test",
      });
      expect(res.statusCode).toBe(403);
    });

    it("should reject relative paths completely", async () => {
      const res = await request(app).post("/api/queue").send({
        path: "./relative/path",
        collection: "test",
      });
      expect(res.statusCode).toBe(403);
    });

    it("should accept paths within ALLOWED_BROWSE_ROOTS", async () => {
      const res = await request(app)
        .post("/api/queue")
        .send({
          path: path.join(TEST_ALLOWED_ROOT, "my-documents"),
          collection: "test",
        });
      // 201 Created because queue mocking intercepts it, or 400 if other validation fails.
      // The key is it should NOT be 403 Forbidden.
      expect(res.statusCode).not.toBe(403);
    });

    it("should reject directory traversal attempting to escape allowed root", async () => {
      const res = await request(app)
        .post("/api/queue")
        .send({
          path: path.join(TEST_ALLOWED_ROOT, "..", "escaped-folder"),
          collection: "test",
        });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("Collection Name Validation", () => {
    it("should reject directory traversal in collection name", async () => {
      const res = await request(app)
        .post("/api/chat")
        .send({
          messages: [{ role: "user", content: "hi" }],
          collection: "../../etc/passwd",
        });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Invalid collection/);
    });

    it("should reject special characters in collection name", async () => {
      const res = await request(app)
        .post("/api/queue")
        .send({
          path: path.join(TEST_ALLOWED_ROOT, "folder"),
          collection: "My Collection!", // Space and exclamation not allowed
        });
      expect(res.statusCode).toBe(400);
    });
  });
});
