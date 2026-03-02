import { jest } from "@jest/globals";
import request from "supertest";

// ESM Mocking for child_process — spawn is only used by IngestionQueue now
jest.unstable_mockModule("child_process", () => ({
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn((event, cb) => {
      if (event === "close") cb(0);
    }),
  })),
}));

// Dynamic import after mocking
const appModule = await import("../server.js");
const app = appModule.default;

describe("API Routes Integration (ESM)", () => {
  describe("GET /api/health", () => {
    it("should return 200 OK", async () => {
      const res = await request(app).get("/api/health");
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("checks");
    });
  });

  describe("GET /api/queue", () => {
    it("should return an empty array initially", async () => {
      const res = await request(app).get("/api/queue");
      expect(res.statusCode).toBe(200);
      // Queues might be persisted on disk? "Loaded 2 jobs".
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("POST /api/queue", () => {
    it("should return 400 if path is missing", async () => {
      const res = await request(app)
        .post("/api/queue")
        .send({ collection: "test" });
      expect(res.statusCode).toBe(400);
    });

    it("should return 400 if collection is missing", async () => {
      const res = await request(app)
        .post("/api/queue")
        .send({ path: "C:/tmp" });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/chat", () => {
    it("should return 400 if messages are missing", async () => {
      const res = await request(app)
        .post("/api/chat")
        .send({ collection: "test" });
      expect(res.statusCode).toBe(400);
    });
  });
});
