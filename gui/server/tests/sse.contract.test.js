/**
 * SSE Contract Test — /api/chat
 *
 * Validates that the Server-Sent Events stream from the chat endpoint
 * conforms to the exact JSON format that the client (main.js) expects.
 *
 * This test would have caught the bug where the server was sending raw
 * text tokens (`data: Hello`) instead of JSON (`data: {"message":{"content":"Hello"}}`).
 */

import { jest } from "@jest/globals";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────

// Mock child_process (needed by server.js for config loading / PowerShellRunner)
jest.unstable_mockModule("child_process", () => ({
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn((event, cb) => {
      if (event === "close") cb(0);
    }),
  })),
  spawnSync: jest.fn(() => ({
    status: 0,
    stdout: JSON.stringify({
      RAG: {
        OllamaUrl: "http://localhost:11434",
        EmbeddingModel: "nomic-embed-text",
        ChatModel: "test-model",
        TopK: 3,
        MinScore: 0.3,
        ChunkSize: 1000,
        ChunkOverlap: 200,
        MaxContextTokens: 2048,
      },
    }),
  })),
}));

// Mock the Ollama client — return a synthetic embedding and stream test tokens
jest.unstable_mockModule("../lib/ollamaClient.js", () => ({
  embed: jest.fn(async () => new Float32Array(768)),
  chatStream: jest.fn(async (messages, model, url, onChunk) => {
    // Simulate streaming three tokens
    onChunk("Hello");
    onChunk(" world");
    onChunk("!");
  }),
}));

// Mock VectorStore — pre-load with synthetic results
jest.unstable_mockModule("../lib/vectorStore.js", () => {
  const mockStore = {
    count: 2,
    dims: 768,
    model: "nomic-embed-text",
    size: 2,
    load: jest.fn(),
    findNearest: jest.fn(() => [
      {
        score: 0.85,
        ChunkText: "This is a test chunk with full content.",
        TextPreview: "This is a test chunk...",
        FileName: "test_doc.md",
        ChunkIndex: 0,
        HeaderContext: "Test > Section A",
        index: 0,
      },
      {
        score: 0.72,
        ChunkText: "Another test chunk for verification.",
        TextPreview: "Another test chunk...",
        FileName: "test_doc2.md",
        ChunkIndex: 1,
        HeaderContext: "Test > Section B",
        index: 1,
      },
    ]),
  };

  return {
    VectorStore: jest.fn(() => mockStore),
  };
});

// Mock QueryLogger to prevent file writes
jest.unstable_mockModule("../lib/queryLogger.js", () => ({
  QueryLogger: jest.fn(() => ({
    log: jest.fn(async () => {}),
    flush: jest.fn(async () => {}),
    initPromise: Promise.resolve(),
  })),
}));

// Dynamic import after all mocks are set up
const appModule = await import("../server.js");
const app = appModule.default;

// ── Helpers ──────────────────────────────────────────────────

/**
 * Parse an SSE response body into structured events.
 * Each event is a parsed JSON object from a `data: ` line.
 */
function parseSSE(responseText) {
  const events = [];
  const errors = [];

  const lines = responseText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data: ")) continue;

    const payload = trimmed.slice(6); // Remove "data: " prefix
    try {
      events.push(JSON.parse(payload));
    } catch (e) {
      errors.push({ raw: trimmed, error: e.message });
    }
  }

  return { events, errors };
}

// ── Tests ────────────────────────────────────────────────────

describe("SSE Contract — /api/chat", () => {
  let response;
  let sseResult;

  beforeAll(async () => {
    response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "What is this project about?" }],
        collection: "TestIngest",
      });

    sseResult = parseSSE(response.text);
  });

  // ── Core Contract: Every line must be valid JSON ──

  it("every data: line must be parseable as JSON", () => {
    expect(sseResult.errors).toEqual([]);
  });

  it("should have at least 3 events (status + citations + tokens)", () => {
    expect(sseResult.events.length).toBeGreaterThanOrEqual(3);
  });

  // ── Event 1: Status ──

  it("first event should be a status event", () => {
    const first = sseResult.events[0];
    expect(first).toHaveProperty("type", "status");
    expect(first).toHaveProperty("message");
    expect(typeof first.message).toBe("string");
  });

  // ── Event 2: Citations (type: "metadata") ──

  it("should have a metadata event with citations array", () => {
    const metaEvent = sseResult.events.find((e) => e.type === "metadata");
    expect(metaEvent).toBeDefined();
    expect(Array.isArray(metaEvent.citations)).toBe(true);
    expect(metaEvent.citations.length).toBeGreaterThan(0);
  });

  it("each citation must have fileName (not file)", () => {
    const metaEvent = sseResult.events.find((e) => e.type === "metadata");
    for (const citation of metaEvent.citations) {
      expect(citation).toHaveProperty("fileName");
      expect(typeof citation.fileName).toBe("string");
      // Ensure the old incorrect key is NOT present
      expect(citation).not.toHaveProperty("file");
    }
  });

  it("each citation must have score, headerContext, and preview", () => {
    const metaEvent = sseResult.events.find((e) => e.type === "metadata");
    for (const citation of metaEvent.citations) {
      expect(typeof citation.score).toBe("number");
      expect(typeof citation.headerContext).toBe("string");
      expect(typeof citation.preview).toBe("string");
    }
  });

  // ── Token Events: message.content ──

  it("token events must have {message: {content: string}}", () => {
    const tokenEvents = sseResult.events.filter(
      (e) => e.message && e.message.content,
    );
    expect(tokenEvents.length).toBeGreaterThan(0);

    for (const token of tokenEvents) {
      expect(typeof token.message.content).toBe("string");
      expect(token.message.content.length).toBeGreaterThan(0);
    }
  });

  it("token contents should reconstruct the full response", () => {
    const tokenEvents = sseResult.events.filter(
      (e) => e.message && e.message.content,
    );
    const fullText = tokenEvents.map((t) => t.message.content).join("");
    expect(fullText).toBe("Hello world!");
  });

  // ── Server-Timing Header ──

  it("should include Server-Timing header", () => {
    const timing = response.headers["server-timing"];
    expect(timing).toBeDefined();
    expect(timing).toMatch(/embed;dur=/);
    expect(timing).toMatch(/search;dur=/);
    expect(timing).toMatch(/total;dur=/);
  });
});
