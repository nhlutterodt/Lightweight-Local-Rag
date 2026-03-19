import { jest } from "@jest/globals";
import request from "supertest";
import fs from "fs";
import path from "path";

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

  function parseSseEvents(responseText) {
    return responseText
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)));
  }

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

    const events = parseSseEvents(response.text);
    const metaEvent = events.find((event) => event.type === "metadata");

    expect(metaEvent.citations).toHaveLength(1);
    expect(metaEvent.citations[0].fileName).toBe("first.md");
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resultCount: 1,
        scoreSchemaVersion: "v1",
        scoreType: "normalized-relevance",
        results: [expect.objectContaining({ fileName: "first.md" })],
        retrievedCandidates: expect.arrayContaining([
          expect.objectContaining({ fileName: "first.md" }),
          expect.objectContaining({ fileName: "second.md" }),
        ]),
        approvedContext: [expect.objectContaining({ fileName: "first.md" })],
        droppedCandidates: [
          expect.objectContaining({
            fileName: "second.md",
            dropReason: "context_budget_exceeded",
          }),
        ],
      }),
    );
  });

  it("emits pdf page ranges only when citations come from the structured page-range path", async () => {
    findNearestMock.mockResolvedValueOnce([
      {
        score: 0.91,
        ChunkText: "page seven excerpt",
        TextPreview: "page seven excerpt",
        FileName: "sample.pdf",
        ChunkIndex: 0,
        HeaderContext: "sample.pdf > Page 7",
        LocatorType: "page-range",
        PageStart: 7,
        PageEnd: 7,
      },
    ]);

    const structuredResponse = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "show the cited PDF page" }],
        collection: "TestIngest",
      });

    expect(structuredResponse.status).toBe(200);

    const structuredEvents = parseSseEvents(structuredResponse.text);
    const structuredMetadata = structuredEvents.find(
      (event) => event.type === "metadata",
    );

    expect(structuredMetadata).toBeDefined();
    expect(structuredMetadata.citations).toHaveLength(1);
    expect(structuredMetadata.citations[0]).toEqual(
      expect.objectContaining({
        fileName: "sample.pdf",
        locatorType: "page-range",
        pageStart: 7,
        pageEnd: 7,
      }),
    );

    findNearestMock.mockResolvedValueOnce([
      {
        score: 0.89,
        ChunkText: "legacy pdf excerpt",
        TextPreview: "legacy pdf excerpt",
        FileName: "legacy.pdf",
        ChunkIndex: 0,
        HeaderContext: "legacy.pdf",
        LocatorType: "none",
      },
    ]);

    const flattenedResponse = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "show the legacy PDF citation" }],
        collection: "TestIngest",
      });

    expect(flattenedResponse.status).toBe(200);

    const flattenedEvents = parseSseEvents(flattenedResponse.text);
    const flattenedMetadata = flattenedEvents.find(
      (event) => event.type === "metadata",
    );

    expect(flattenedMetadata).toBeDefined();
    expect(flattenedMetadata.citations).toHaveLength(1);
    expect(flattenedMetadata.citations[0]).toEqual(
      expect.objectContaining({
        fileName: "legacy.pdf",
        locatorType: "none",
      }),
    );
    expect(flattenedMetadata.citations[0]).not.toHaveProperty("pageStart");
    expect(flattenedMetadata.citations[0]).not.toHaveProperty("pageEnd");
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

  it("logs below_min_score dropped candidates when vector trace includes threshold drops", async () => {
    findNearestMock.mockResolvedValue({
      results: [
        {
          score: 0.9,
          ChunkText: "kept chunk",
          TextPreview: "kept chunk",
          FileName: "kept.md",
          ChunkIndex: 0,
          HeaderContext: "Doc > Keep",
        },
      ],
      retrievedCandidates: [
        {
          fileName: "kept.md",
          chunkId: "chk_keep",
          sourceId: "src_keep",
          score: 0.9,
          preview: "kept chunk",
          locatorType: "none",
          headerContext: "Doc > Keep",
        },
        {
          fileName: "dropped-low.md",
          chunkId: "chk_low",
          sourceId: "src_low",
          score: 0.2,
          preview: "dropped",
          locatorType: "none",
          headerContext: "Doc > Low",
        },
      ],
      droppedCandidates: [
        {
          fileName: "dropped-low.md",
          chunkId: "chk_low",
          sourceId: "src_low",
          score: 0.2,
          preview: "dropped",
          locatorType: "none",
          headerContext: "Doc > Low",
          dropReason: "below_min_score",
        },
      ],
    });

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "threshold drop test" }],
        collection: "TestIngest",
      });

    expect(response.status).toBe(200);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        droppedCandidates: expect.arrayContaining([
          expect.objectContaining({ dropReason: "below_min_score" }),
        ]),
      }),
    );
  });

  it("logs strict_filter_excluded dropped candidates when strict filtering excludes metadata mismatches", async () => {
    findNearestMock.mockResolvedValue({
      results: [
        {
          score: 0.88,
          ChunkText: "strict keep",
          TextPreview: "strict keep",
          FileName: "strict-keep.ps1",
          ChunkIndex: 0,
          HeaderContext: "PowerShell > Keep",
        },
      ],
      retrievedCandidates: [
        {
          fileName: "strict-keep.ps1",
          chunkId: "chk_strict_keep",
          sourceId: "src_strict_keep",
          score: 0.88,
          preview: "strict keep",
          locatorType: "declaration",
          headerContext: "PowerShell > Keep",
        },
        {
          fileName: "strict-drop.md",
          chunkId: "chk_strict_drop",
          sourceId: "src_strict_drop",
          score: 0.83,
          preview: "strict drop",
          locatorType: "section",
          headerContext: "Doc > Drop",
        },
      ],
      droppedCandidates: [
        {
          fileName: "strict-drop.md",
          chunkId: "chk_strict_drop",
          sourceId: "src_strict_drop",
          score: 0.83,
          preview: "strict drop",
          locatorType: "section",
          headerContext: "Doc > Drop",
          dropReason: "strict_filter_excluded",
        },
      ],
    });

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "strict filter drop test" }],
        collection: "TestIngest",
        retrievalMode: "filtered-vector",
        retrievalConstraints: {
          fileType: "powershell",
          strict: true,
        },
      });

    expect(response.status).toBe(200);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        droppedCandidates: expect.arrayContaining([
          expect.objectContaining({ dropReason: "strict_filter_excluded" }),
        ]),
      }),
    );
  });

  it("logs collection_not_ready dropReason when collection load fails", async () => {
    loadMock.mockRejectedValueOnce(new Error("Table 'TestIngest' does not exist yet."));
    findNearestMock.mockResolvedValue([]);

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "collection readiness test" }],
        collection: "TestIngest",
      });

    expect(response.status).toBe(200);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        droppedCandidates: expect.arrayContaining([
          expect.objectContaining({ dropReason: "collection_not_ready" }),
        ]),
      }),
    );
  });

  it("logs embedding_model_mismatch dropReason and returns 500 when retrieval detects model mismatch", async () => {
    findNearestMock.mockRejectedValueOnce(
      new Error("Embedding model mismatch: store=legacy-model, query=nomic-embed-text"),
    );

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "model mismatch test" }],
        collection: "TestIngest",
      });

    expect(response.status).toBe(500);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        droppedCandidates: expect.arrayContaining([
          expect.objectContaining({ dropReason: "embedding_model_mismatch" }),
        ]),
      }),
    );
  });

  it("enforces budget-pruning fixture barrier with approved subset and answer references subset", async () => {
    const fixturePath = path.resolve(
      process.cwd(),
      "tests/data/budget_pruning_corpus.json",
    );
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    findNearestMock.mockResolvedValue(fixture.searchOutput);

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: fixture.query }],
        collection: fixture.collection,
      });

    expect(response.status).toBe(200);

    const logEntry = logMock.mock.calls.at(-1)[0];
    expect(logEntry.approvedContext).toHaveLength(1);
    expect(logEntry.approvedContext[0].fileName).toBe(
      fixture.expected.approvedFileNames[0],
    );
    expect(logEntry.droppedCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: fixture.expected.droppedFileNames[0],
          dropReason: fixture.expected.dropReason,
        }),
      ]),
    );

    const approvedChunkIds = new Set(
      logEntry.approvedContext.map((item) => item.chunkId),
    );
    for (const reference of logEntry.answerReferences || []) {
      expect(approvedChunkIds.has(reference.chunkId)).toBe(true);
    }
  });
});