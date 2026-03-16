import { jest } from "@jest/globals";
import request from "supertest";

// This suite is intentionally expected to fail until Phase A/C provenance
// implementation lands. It defines the target behavior before schema changes.

const findNearestMock = jest.fn(async () => [
  {
    score: 0.89,
    ChunkText: "Evidence chunk alpha.",
    TextPreview: "Evidence chunk alpha.",
    FileName: "alpha.md",
    ChunkIndex: 0,
    HeaderContext: "Alpha > Section",
  },
  {
    score: 0.84,
    ChunkText: "Evidence chunk beta.",
    TextPreview: "Evidence chunk beta.",
    FileName: "beta.md",
    ChunkIndex: 1,
    HeaderContext: "Beta > Section",
  },
]);

jest.unstable_mockModule("child_process", () => ({
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn((event, cb) => {
      if (event === "close") cb(0);
    }),
  })),
}));

jest.unstable_mockModule("../lib/ollamaClient.js", () => ({
  embed: jest.fn(async () => new Float32Array(768)),
  chatStream: jest.fn(async (messages, model, url, onChunk) => {
    onChunk("Grounded ");
    onChunk("answer.");
  }),
}));

jest.unstable_mockModule("../lib/vectorStore.js", () => ({
  VectorStore: jest.fn(() => ({
    count: 2,
    dims: 768,
    model: "nomic-embed-text",
    size: 2,
    load: jest.fn(),
    findNearest: findNearestMock,
  })),
}));

jest.unstable_mockModule("../lib/queryLogger.js", () => ({
  QueryLogger: jest.fn(() => ({
    log: jest.fn(async () => {}),
    flush: jest.fn(async () => {}),
    initPromise: Promise.resolve(),
  })),
}));

const appModule = await import("../server.js");
const app = appModule.default;

function parseSSEEvents(rawText) {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
}

describe("Phase A provenance contract (test-first)", () => {
  beforeEach(() => {
    findNearestMock.mockClear();
  });

  it("metadata citations include chunkId and sourceId for every citation", async () => {
    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "Which chunks support this?" }],
        collection: "TestIngest",
      });

    expect(response.status).toBe(200);

    const events = parseSSEEvents(response.text);
    const metadataEvent = events.find((event) => event.type === "metadata");

    expect(metadataEvent).toBeDefined();
    expect(Array.isArray(metadataEvent.citations)).toBe(true);
    expect(metadataEvent.citations.length).toBeGreaterThan(0);

    for (const citation of metadataEvent.citations) {
      expect(citation).toHaveProperty("chunkId");
      expect(typeof citation.chunkId).toBe("string");
      expect(citation.chunkId.length).toBeGreaterThan(0);
      expect(citation).toHaveProperty("sourceId");
      expect(typeof citation.sourceId).toBe("string");
      expect(citation.sourceId.length).toBeGreaterThan(0);
    }
  });

  it("emits a final answer_references event with chunkId references", async () => {
    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "Give me the grounded answer." }],
        collection: "TestIngest",
      });

    expect(response.status).toBe(200);

    const events = parseSSEEvents(response.text);
    const answerReferences = events.find(
      (event) => event.type === "answer_references",
    );

    expect(answerReferences).toBeDefined();
    expect(Array.isArray(answerReferences.references)).toBe(true);
    expect(answerReferences.references.length).toBeGreaterThan(0);

    for (const reference of answerReferences.references) {
      expect(reference).toHaveProperty("chunkId");
      expect(typeof reference.chunkId).toBe("string");
      expect(reference.chunkId.length).toBeGreaterThan(0);
    }
  });

  it("answer_references only contains chunkIds present in metadata citations", async () => {
    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "Cite only approved chunks." }],
        collection: "TestIngest",
      });

    expect(response.status).toBe(200);

    const events = parseSSEEvents(response.text);
    const metadataEvent = events.find((event) => event.type === "metadata");
    const answerReferences = events.find(
      (event) => event.type === "answer_references",
    );

    const citationChunkIds = new Set(
      (metadataEvent?.citations || []).map((citation) => citation.chunkId),
    );

    expect(citationChunkIds.size).toBeGreaterThan(0);
    expect(answerReferences).toBeDefined();

    for (const reference of answerReferences.references || []) {
      expect(citationChunkIds.has(reference.chunkId)).toBe(true);
    }
  });

  it("emits empty answer_references for no-approved-context and allows optional grounding_warning", async () => {
    findNearestMock.mockResolvedValueOnce([]);

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "No evidence expected" }],
        collection: "TestIngest",
      });

    expect(response.status).toBe(200);

    const events = parseSSEEvents(response.text);
    const metadataEvent = events.find((event) => event.type === "metadata");
    const answerReferences = events.find(
      (event) => event.type === "answer_references",
    );
    const groundingWarning = events.find(
      (event) => event.type === "grounding_warning",
    );

    expect(metadataEvent).toBeDefined();
    expect(Array.isArray(metadataEvent.citations)).toBe(true);
    expect(metadataEvent.citations).toHaveLength(0);

    expect(answerReferences).toBeDefined();
    expect(Array.isArray(answerReferences.references)).toBe(true);
    expect(answerReferences.references).toHaveLength(0);

    if (groundingWarning) {
      expect(typeof groundingWarning.code).toBe("string");
      expect(groundingWarning.code.length).toBeGreaterThan(0);
      expect(typeof groundingWarning.message).toBe("string");
      expect(groundingWarning.message.length).toBeGreaterThan(0);
    }
  });
});