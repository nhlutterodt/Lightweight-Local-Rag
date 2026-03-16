/**
 * modelMigration.test.js
 *
 * Unit tests for triggerModelMigration().
 *
 * Mock pattern: plain objects with jest.fn() — same as integrityCheck.test.js.
 * No real filesystem or LanceDB operations.
 */

import { jest } from "@jest/globals";
import { triggerModelMigration } from "../lib/modelMigration.js";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

/**
 * @param {Array<{FileName: string, SourcePath: string|null}>} entryList
 */
function makeParser(entryList) {
  const map = new Map(
    entryList.map((e) => [e.FileName.toLowerCase(), e]),
  );
  return {
    entries: map,
    clear: jest.fn().mockResolvedValue(undefined),
  };
}

function makeQueue() {
  return {
    enqueue: jest.fn().mockReturnValue({ id: "job", status: "pending" }),
  };
}

const COL = "TestCollection";
const STORED = "old-model";
const TARGET = "new-model";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("triggerModelMigration", () => {
  // 1 — Empty manifest
  test("empty manifest returns queued:0 and does not call enqueue", async () => {
    const parser = makeParser([]);
    const queue = makeQueue();

    const result = await triggerModelMigration(parser, queue, COL, STORED, TARGET);

    expect(result).toEqual({ queued: 0, sourceDirs: [] });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  // 2 — All null/empty SourcePath
  test("all null or empty SourcePath entries returns queued:0", async () => {
    const parser = makeParser([
      { FileName: "a.md", SourcePath: null },
      { FileName: "b.md", SourcePath: "" },
      { FileName: "c.md", SourcePath: "   " },
    ]);
    const queue = makeQueue();

    const result = await triggerModelMigration(parser, queue, COL, STORED, TARGET);

    expect(result).toEqual({ queued: 0, sourceDirs: [] });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  // 3 — No valid paths → parser.clear NOT called
  test("does not call parser.clear when there are no valid SourcePath entries", async () => {
    const parser = makeParser([
      { FileName: "a.md", SourcePath: null },
    ]);
    const queue = makeQueue();

    await triggerModelMigration(parser, queue, COL, STORED, TARGET);

    expect(parser.clear).not.toHaveBeenCalled();
  });

  // 4 — Two files in the same directory → single enqueue call
  test("two files in the same directory result in one enqueue call", async () => {
    const parser = makeParser([
      { FileName: "a.md", SourcePath: "/docs/a.md" },
      { FileName: "b.md", SourcePath: "/docs/b.md" },
    ]);
    const queue = makeQueue();

    const result = await triggerModelMigration(parser, queue, COL, STORED, TARGET);

    expect(parser.clear).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith("/docs", COL);
    expect(result.queued).toBe(1);
  });

  // 5 — Two distinct directories → two enqueue calls
  test("two distinct source directories each produce one enqueue call", async () => {
    const parser = makeParser([
      { FileName: "a.md", SourcePath: "/docs/a.md" },
      { FileName: "b.md", SourcePath: "/reports/b.md" },
    ]);
    const queue = makeQueue();

    const result = await triggerModelMigration(parser, queue, COL, STORED, TARGET);

    expect(queue.enqueue).toHaveBeenCalledTimes(2);
    expect(result.queued).toBe(2);
    expect(result.sourceDirs).toHaveLength(2);
  });

  // 6 — Deduplication: three files from the same directory → exactly one enqueue
  test("three files from the same directory deduplicate to one enqueue call", async () => {
    const parser = makeParser([
      { FileName: "a.md", SourcePath: "/docs/a.md" },
      { FileName: "b.md", SourcePath: "/docs/b.md" },
      { FileName: "c.md", SourcePath: "/docs/c.md" },
    ]);
    const queue = makeQueue();

    const result = await triggerModelMigration(parser, queue, COL, STORED, TARGET);

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(result.queued).toBe(1);
  });

  // 7 — Mixed valid/null SourcePath
  test("mixed valid and null SourcePath entries enqueue only valid directories", async () => {
    const parser = makeParser([
      { FileName: "a.md", SourcePath: "/docs/a.md" },
      { FileName: "b.md", SourcePath: null },
    ]);
    const queue = makeQueue();

    const result = await triggerModelMigration(parser, queue, COL, STORED, TARGET);

    expect(parser.clear).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(result.queued).toBe(1);
  });

  // 8 — clear() is called before enqueue()
  test("parser.clear is called before queue.enqueue", async () => {
    const callOrder = [];

    const parser = makeParser([
      { FileName: "a.md", SourcePath: "/docs/a.md" },
    ]);
    parser.clear = jest.fn().mockImplementation(async () => {
      callOrder.push("clear");
    });

    const queue = makeQueue();
    queue.enqueue = jest.fn().mockImplementation(() => {
      callOrder.push("enqueue");
      return { id: "job", status: "pending" };
    });

    await triggerModelMigration(parser, queue, COL, STORED, TARGET);

    expect(callOrder).toEqual(["clear", "enqueue"]);
  });

  // 9 — Collection name is forwarded to enqueue
  test("enqueue receives the correct collection name as the second argument", async () => {
    const customCollection = "MySpecialCollection";
    const parser = makeParser([
      { FileName: "a.md", SourcePath: "/data/a.md" },
    ]);
    const queue = makeQueue();

    await triggerModelMigration(parser, queue, customCollection, STORED, TARGET);

    expect(queue.enqueue).toHaveBeenCalledWith("/data", customCollection);
  });
});
