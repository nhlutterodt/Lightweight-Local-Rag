/**
 * Prompt Assembly Test — Phase C1
 *
 * Validates that /api/chat assembles the system prompt using structured
 * [CHUNK ...]/[/CHUNK] context blocks instead of flat [Source: ...] headers.
 *
 * Test-first gate for C1: these tests are written before the implementation
 * and must FAIL until server.js emits structured CHUNK blocks.
 */

import { jest } from "@jest/globals";
import request from "supertest";

// Capture the messages array passed to chatStream so tests can inspect the
// system prompt without parsing SSE.
let capturedOllamaMessages = null;

const mockFindNearest = jest.fn(async () => [
  {
    score: 0.90,
    ChunkText: "Content of the first chunk.",
    TextPreview: "Content of the first chunk.",
    FileName: "guide.md",
    SourceId: "src_guide1234567890ab",
    ChunkHash: "guide_hash_12345678",
    ChunkIndex: 0,
    LocatorType: "section",
    HeaderContext: "Guide > Introduction",
  },
  {
    score: 0.80,
    ChunkText: "Content of the second chunk.",
    TextPreview: "Content of the second chunk.",
    FileName: "script.ps1",
    SourceId: "src_script234567890a",
    ChunkHash: "script_hash_1234567",
    ChunkIndex: 0,
    LocatorType: "declaration",
    HeaderContext: "None",
  },
]);

// ── Mocks ─────────────────────────────────────────────────────────────────────

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
    capturedOllamaMessages = messages;
    onChunk("structured answer");
  }),
}));

jest.unstable_mockModule("../lib/vectorStore.js", () => ({
  VectorStore: jest.fn(() => ({
    count: 2,
    dims: 768,
    model: "nomic-embed-text",
    size: 2,
    load: jest.fn(),
    findNearest: mockFindNearest,
  })),
}));

jest.unstable_mockModule("../lib/queryLogger.js", () => ({
  QueryLogger: jest.fn(() => ({
    log: jest.fn(async () => {}),
    flush: jest.fn(async () => {}),
    initPromise: Promise.resolve(),
  })),
}));

// Dynamic import after mocks are registered
const appModule = await import("../server.js");
const app = appModule.default;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function postChat(content = "What is in the guide?") {
  return request(app).post("/api/chat").send({
    messages: [{ role: "user", content }],
    collection: "TestIngest",
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Phase C1 — Structured prompt context blocks", () => {
  beforeEach(() => {
    capturedOllamaMessages = null;
    mockFindNearest.mockClear();
  });

  it("system prompt uses [CHUNK ...] blocks instead of [Source: ...] headers", async () => {
    await postChat();

    expect(capturedOllamaMessages).not.toBeNull();
    const systemMsg = capturedOllamaMessages.find((m) => m.role === "system");
    expect(systemMsg).toBeDefined();

    expect(systemMsg.content).toContain("[CHUNK ");
    expect(systemMsg.content).toContain("[/CHUNK]");

    // Old flat format must be gone
    expect(systemMsg.content).not.toContain("[Source:");
  });

  it("CHUNK opening tag carries chunkId, sourceId, file, and locator attributes", async () => {
    await postChat();

    const systemMsg = capturedOllamaMessages.find((m) => m.role === "system");
    const content = systemMsg.content;

    // First row: ChunkHash present → chunkId = chk_guide_hash_12345678
    expect(content).toContain("chunkId=chk_guide_hash_12345678");
    expect(content).toContain("sourceId=src_guide1234567890ab");
    expect(content).toContain("file=guide.md");
    expect(content).toContain("locator=section");

    // Second row
    expect(content).toContain("chunkId=chk_script_hash_1234567");
    expect(content).toContain("sourceId=src_script234567890a");
    expect(content).toContain("file=script.ps1");
    expect(content).toContain("locator=declaration");
  });

  it("CHUNK block includes header attribute when HeaderContext is not 'None'", async () => {
    await postChat();

    const systemMsg = capturedOllamaMessages.find((m) => m.role === "system");
    // guide.md has HeaderContext: "Guide > Introduction"
    expect(systemMsg.content).toContain('header="Guide > Introduction"');
  });

  it("CHUNK block omits header attribute when HeaderContext is 'None'", async () => {
    await postChat();

    const systemMsg = capturedOllamaMessages.find((m) => m.role === "system");
    // Parse out the CHUNK opening tags
    const chunkTags = systemMsg.content.match(/\[CHUNK [^\]]+\]/g) || [];
    const scriptTag = chunkTags.find((tag) => tag.includes("file=script.ps1"));

    expect(scriptTag).toBeDefined();
    expect(scriptTag).not.toContain("header=");
  });

  it("chunk text content appears between [CHUNK ...] and [/CHUNK]", async () => {
    await postChat();

    const systemMsg = capturedOllamaMessages.find((m) => m.role === "system");
    expect(systemMsg.content).toContain("Content of the first chunk.");
    expect(systemMsg.content).toContain("Content of the second chunk.");
  });

  it("each CHUNK block is properly closed with [/CHUNK]", async () => {
    await postChat();

    const systemMsg = capturedOllamaMessages.find((m) => m.role === "system");
    const openCount = (systemMsg.content.match(/\[CHUNK /g) || []).length;
    const closeCount = (systemMsg.content.match(/\[\/CHUNK\]/g) || []).length;

    expect(openCount).toBe(2);
    expect(closeCount).toBe(2);
    expect(openCount).toBe(closeCount);
  });

  it("no-evidence context uses plain fallback string and no CHUNK blocks", async () => {
    mockFindNearest.mockResolvedValueOnce([]);

    await postChat("Nothing here");

    const systemMsg = capturedOllamaMessages.find((m) => m.role === "system");
    expect(systemMsg.content).toContain("No relevant local documents found.");
    expect(systemMsg.content).not.toContain("[CHUNK ");
  });
});
