import { jest } from "@jest/globals";
import request from "supertest";

const loadMock = jest.fn();
const findNearestMock = jest.fn();
const logMock = jest.fn(async () => {});
const chatStreamMock = jest.fn(async (messages, model, url, onChunk) => {
  onChunk("ok");
});

jest.unstable_mockModule("child_process", () => ({
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn((event, cb) => {
      if (event === "close") cb(0);
    }),
  })),
}));

jest.unstable_mockModule("../lib/configLoader.js", () => ({
  loadConfig: jest.fn(() => ({
    RAG: {
      OllamaUrl: "http://localhost:11434",
      EmbeddingModel: "nomic-embed-text",
      ChatModel: "llama3.1:8b",
      TopK: 5,
      MinScore: 0.5,
      MaxContextTokens: 5,
      RetrievalMode: "vector",
      FilteredVectorOverfetch: 4,
    },
  })),
}));

jest.unstable_mockModule("../lib/ollamaClient.js", () => ({
  embed: jest.fn(async () => new Float32Array(768)),
  chatStream: chatStreamMock,
}));

jest.unstable_mockModule("../lib/vectorStore.js", () => ({
  VectorStore: jest.fn(() => ({
    count: 2,
    dims: 768,
    model: "nomic-embed-text",
    size: 2,
    load: loadMock,
    findNearest: findNearestMock,
  })),
}));

jest.unstable_mockModule("../lib/queryLogger.js", () => ({
  QueryLogger: jest.fn(() => ({
    log: logMock,
    flush: jest.fn(async () => {}),
    initPromise: Promise.resolve(),
  })),
}));

const appModule = await import("../server.js");
const app = appModule.default;

describe("Retrieval behavior — /api/chat", () => {
  beforeEach(() => {
    findNearestMock.mockReset();
    logMock.mockClear();
    chatStreamMock.mockClear();
    loadMock.mockClear();
  });

  it("uses MaxContextTokens from config to trim emitted context and citations", async () => {
    findNearestMock.mockResolvedValue([
      {
        score: 0.9,
        ChunkText: "alpha beta gamma",
        TextPreview: "alpha beta gamma",
        FileName: "first.md",
        ChunkIndex: 0,
        HeaderContext: "Doc > One",
      },
      {
        score: 0.8,
        ChunkText: "delta epsilon zeta",
        TextPreview: "delta epsilon zeta",
        FileName: "second.md",
        ChunkIndex: 1,
        HeaderContext: "Doc > Two",
      },
    ]);

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "test question" }],
        collection: "TestIngest",
      });

    expect(response.status).toBe(200);

    const systemPrompt = chatStreamMock.mock.calls[0][0][0].content;
    expect(systemPrompt).toContain("first.md");
    expect(systemPrompt).not.toContain("second.md");

    const lines = response.text
      .split("\n")
      .filter((line) => line.startsWith("data: "));
    const events = lines.map((line) => JSON.parse(line.slice(6)));
    const metaEvent = events.find((event) => event.type === "metadata");

    expect(metaEvent.citations).toHaveLength(1);
    expect(metaEvent.citations[0].fileName).toBe("first.md");
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resultCount: 1,
        results: [expect.objectContaining({ fileName: "first.md" })],
      }),
    );
  });

  it("marks lowConfidence when the top emitted score is within the warning band", async () => {
    findNearestMock.mockResolvedValue([
      {
        score: 0.55,
        ChunkText: "alpha beta",
        TextPreview: "alpha beta",
        FileName: "low-score.md",
        ChunkIndex: 0,
        HeaderContext: "Doc > Low",
      },
    ]);

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "test question" }],
        collection: "TestIngest",
      });

    expect(response.status).toBe(200);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lowConfidence: true,
        resultCount: 1,
        retrievalMode: "vector",
        retrievalOverfetchFactor: 1,
      }),
    );
  });

  it("rejects unsupported retrieval modes", async () => {
    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "test question" }],
        collection: "TestIngest",
        retrievalMode: "unknown-mode",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid retrievalMode/i);
  });

  it("passes filtered-vector retrieval options into findNearest", async () => {
    findNearestMock.mockResolvedValue([
      {
        score: 0.9,
        ChunkText: "power shell chunk",
        TextPreview: "power shell chunk",
        FileName: "Chat-Rag.ps1",
        ChunkIndex: 0,
        HeaderContext: "PowerShell > Function",
      },
    ]);

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "show function in Chat-Rag.ps1" }],
        collection: "TestIngest",
        retrievalMode: "filtered-vector",
        retrievalConstraints: {
          fileType: "powershell",
          strict: true,
        },
      });

    expect(response.status).toBe(200);
    expect(findNearestMock).toHaveBeenCalledWith(
      expect.any(Float32Array),
      5,
      0.5,
      expect.objectContaining({
        mode: "filtered-vector",
        strictFilter: true,
        overfetchFactor: 4,
        metadataFilters: expect.objectContaining({
          fileTypeEquals: "powershell",
          fileNameContains: "Chat-Rag.ps1",
        }),
      }),
    );

    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        retrievalMode: "filtered-vector",
        constraintsActive: true,
        retrievalOverfetchFactor: 4,
      }),
    );
  });

  it("uses adaptive overfetch factor 1 when filtered-vector has no active constraints", async () => {
    findNearestMock.mockResolvedValue([
      {
        score: 0.75,
        ChunkText: "generic chunk",
        TextPreview: "generic chunk",
        FileName: "Architecture_Design.md",
        ChunkIndex: 0,
        HeaderContext: "Architecture",
      },
    ]);

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "Explain retrieval architecture" }],
        collection: "TestIngest",
        retrievalMode: "filtered-vector",
      });

    expect(response.status).toBe(200);
    expect(findNearestMock).toHaveBeenCalledWith(
      expect.any(Float32Array),
      5,
      0.5,
      expect.objectContaining({
        mode: "filtered-vector",
        overfetchFactor: 1,
      }),
    );
  });
});