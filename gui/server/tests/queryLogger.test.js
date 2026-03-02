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
});
