import { jest } from "@jest/globals";
import request from "supertest";

// Mock dependencies
jest.unstable_mockModule("child_process", () => ({
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn(),
  })),
  spawnSync: jest.fn(() => ({ status: 0, stdout: "{}" })),
}));

const appModule = await import("../server.js");
const app = appModule.default;

describe("Security Controls", () => {
  describe("Path Traversal Protection", () => {
    it("should reject ingestion of C:\\Windows", async () => {
      const res = await request(app).post("/api/queue").send({
        path: "C:\\Windows\\System32",
        collection: "test",
      });
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/Unsafe/);
    });

    it("should reject relative paths", async () => {
      const res = await request(app).post("/api/queue").send({
        path: "./relative/path",
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
      const res = await request(app).post("/api/queue").send({
        path: "C:\\Users\\Safe",
        collection: "My Collection!", // Space and exclamation not allowed
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
