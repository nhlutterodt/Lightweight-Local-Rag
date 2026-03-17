import { jest } from "@jest/globals";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { QueryLogger } from "../lib/queryLogger.js";

describe("QueryLogger", () => {
  let tempDir;
  let logPath;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "query-logger-test-"));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    logPath = path.join(tempDir, `queries-${Date.now()}.jsonl`);
  });

  it("should initialize and create the log directory if it doesn't exist", async () => {
    const nestedPath = path.join(tempDir, "nested", "logs.jsonl");
    const logger = new QueryLogger(nestedPath);
    await logger.initPromise;

    const stats = await fs.stat(path.dirname(nestedPath));
    expect(stats.isDirectory()).toBe(true);

    await logger.flush();
  });

  it("should handle initialization errors gracefully", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // Create a file and then try to use it as a directory to force ENOTDIR
    const dummyFile = path.join(tempDir, "not-a-dir.txt");
    await fs.writeFile(dummyFile, "dummy context");
    const badPath = path.join(dummyFile, "logs.jsonl");

    const logger = new QueryLogger(badPath);
    await logger.initPromise;

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[QueryLogger] Failed to initialize:",
      expect.anything(),
    );

    // Call log and flush to ensure they don't crash when unitialized
    await logger.log({ query: "Test" });
    await logger.flush();

    consoleErrorSpy.mockRestore();
  });

  it("should log entries as JSONL", async () => {
    const logger = new QueryLogger(logPath);
    await logger.initPromise;

    await logger.log({ query: "Hello World", user: "admin" });
    await logger.log({ query: "Second query", user: "guest" });

    await logger.flush();

    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");

    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0])).toEqual({
      query: "Hello World",
      user: "admin",
    });
    expect(JSON.parse(lines[1])).toEqual({
      query: "Second query",
      user: "guest",
    });
  });

  it("should truncate queries exceeding 500 characters", async () => {
    const logger = new QueryLogger(logPath);
    await logger.initPromise;

    const longQuery = "A".repeat(600);
    await logger.log({ query: longQuery });

    await logger.flush();

    const content = await fs.readFile(logPath, "utf-8");
    const parsed = JSON.parse(content.trim());

    expect(parsed.query.length).toBe(503); // 500 + '...'
    expect(parsed.query.endsWith("...")).toBe(true);
  });

  it("should handle logging errors gracefully", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const logger = new QueryLogger(logPath);
    await logger.initPromise;

    // Force an error during stringify or writing
    const circularObj = {};
    circularObj.self = circularObj;

    await logger.log(circularObj);

    expect(consoleErrorSpy).toHaveBeenCalled();

    await logger.flush();
    consoleErrorSpy.mockRestore();
  });

  // ── Phase A telemetry gate ────────────────────────────────────────────────
  // RAG_PhaseA_Failing_Provenance_Test_Plan.md — Current Green Gates table:
  // "Query log includes chunkId and sourceId per result | queryLogger.test.js (add)"
  // Verifies that the logger preserves chunkId and sourceId provenance fields
  // in logged result entries so post-hoc traceability is never silently dropped.
  it("preserves chunkId and sourceId provenance fields in logged query result entries", async () => {
    const logger = new QueryLogger(logPath);
    await logger.initPromise;

    await logger.log({
      query: "which documents relate to topic X?",
      results: [
        {
          chunkId: "chk_abc1234567890123",
          sourceId: "src_doc1id1234567890",
          score: 0.9,
          fileName: "guide.md",
          headerContext: "Introduction",
        },
        {
          chunkId: "chk_def1234567890123",
          sourceId: "src_doc2id1234567890",
          score: 0.7,
          fileName: "spec.md",
          headerContext: "Overview",
        },
      ],
      answerReferences: ["chk_abc1234567890123"],
    });

    await logger.flush();

    const content = await fs.readFile(logPath, "utf-8");
    const parsed = JSON.parse(content.trim());

    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results).toHaveLength(2);

    expect(parsed.results[0].chunkId).toBe("chk_abc1234567890123");
    expect(parsed.results[0].sourceId).toBe("src_doc1id1234567890");

    expect(parsed.results[1].chunkId).toBe("chk_def1234567890123");
    expect(parsed.results[1].sourceId).toBe("src_doc2id1234567890");

    expect(parsed.answerReferences).toEqual(["chk_abc1234567890123"]);
  });

  it("preserves provenance fields even when other result fields are absent", async () => {
    const logger = new QueryLogger(logPath);
    await logger.initPromise;

    // Minimal payload — only identity fields present
    await logger.log({
      query: "minimal test",
      results: [{ chunkId: "chk_min1234567890123", sourceId: "src_min1234567890" }],
    });

    await logger.flush();

    const content = await fs.readFile(logPath, "utf-8");
    const parsed = JSON.parse(content.trim());

    expect(parsed.results[0].chunkId).toBe("chk_min1234567890123");
    expect(parsed.results[0].sourceId).toBe("src_min1234567890");
  });

  it("round-trips answerReferences with chunkId and sourceId fields", async () => {
    const logger = new QueryLogger(logPath);
    await logger.initPromise;

    await logger.log({
      query: "ground this answer",
      results: [
        {
          chunkId: "chk_abc1234567890123",
          sourceId: "src_doc1id1234567890",
          fileName: "guide.md",
        },
      ],
      answerReferences: [
        {
          chunkId: "chk_abc1234567890123",
          sourceId: "src_doc1id1234567890",
          fileName: "guide.md",
        },
      ],
    });

    await logger.flush();

    const content = await fs.readFile(logPath, "utf-8");
    const parsed = JSON.parse(content.trim());

    expect(parsed.results[0].chunkId).toBe("chk_abc1234567890123");
    expect(parsed.results[0].sourceId).toBe("src_doc1id1234567890");
    expect(Array.isArray(parsed.answerReferences)).toBe(true);
    expect(parsed.answerReferences[0].chunkId).toBe("chk_abc1234567890123");
    expect(parsed.answerReferences[0].sourceId).toBe("src_doc1id1234567890");
  });

  it("keeps answerReferences as a subset of logged result chunkIds when results are present", async () => {
    const logger = new QueryLogger(logPath);
    await logger.initPromise;

    await logger.log({
      query: "subset test",
      results: [
        {
          chunkId: "chk_alpha1234567890",
          sourceId: "src_alpha1234567890",
        },
        {
          chunkId: "chk_beta12345678901",
          sourceId: "src_beta12345678901",
        },
      ],
      answerReferences: [
        {
          chunkId: "chk_alpha1234567890",
          sourceId: "src_alpha1234567890",
        },
      ],
    });

    await logger.flush();

    const content = await fs.readFile(logPath, "utf-8");
    const parsed = JSON.parse(content.trim());
    const resultChunkIds = new Set(parsed.results.map((result) => result.chunkId));

    expect(parsed.answerReferences.length).toBeGreaterThan(0);
    for (const reference of parsed.answerReferences) {
      expect(resultChunkIds.has(reference.chunkId)).toBe(true);
    }
  });
});
