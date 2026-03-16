import { jest } from "@jest/globals";
import { IntegrityCheck } from "../lib/integrityCheck.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock LanceDB table.
 * @param {object[]} rows  Rows returned by table.query().toArray()
 */
function makeTable(rows) {
  return {
    query: jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue(rows),
    }),
    delete: jest.fn().mockResolvedValue(true),
  };
}

/**
 * Creates a minimal mock DocumentParser with the exact surface used by IntegrityCheck.
 * @param {{ FileName: string, ChunkCount: number, EmbeddingModel?: string }[]} entries
 */
function makeParser(entries) {
  const map = new Map(entries.map((e) => [e.FileName.toLowerCase(), e]));
  return {
    entries: map,
    count: () => map.size,
    getEntry: (name) => map.get(name.toLowerCase()) ?? null,
  };
}

/** Builds a minimal vector row. */
function makeRow(fileName, chunkIndex = 0, model = "test-model") {
  return { FileName: fileName, ChunkIndex: chunkIndex, EmbeddingModel: model };
}

/** Returns a ready-looking store wrapper around the given table. */
function makeStore(table) {
  return { isReady: true, table };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IntegrityCheck", () => {
  describe("scan()", () => {
    it("returns zero issues when manifest and DB are in sync", async () => {
      const rows = [makeRow("doc1.md", 0), makeRow("doc1.md", 1)];
      const store = makeStore(makeTable(rows));
      const parser = makeParser([
        { FileName: "doc1.md", ChunkCount: 2, EmbeddingModel: "test-model" },
      ]);

      const { issues, summary } = await new IntegrityCheck(store, parser).scan();

      expect(issues).toHaveLength(0);
      expect(summary.issueCount).toBe(0);
      expect(summary.totalManifestEntries).toBe(1);
      expect(summary.totalVectorFiles).toBe(1);
      expect(summary.totalVectorRows).toBe(2);
    });

    it("reports MISSING_VECTORS when manifest entry has no rows in DB", async () => {
      const store = makeStore(makeTable([]));
      const parser = makeParser([
        { FileName: "missing.md", ChunkCount: 3, EmbeddingModel: "test-model" },
      ]);

      const { issues, summary } = await new IntegrityCheck(store, parser).scan();

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("MISSING_VECTORS");
      expect(issues[0].fileName).toBe("missing.md");
      expect(issues[0].manifestChunkCount).toBe(3);
      expect(summary.byType.MISSING_VECTORS).toBe(1);
    });

    it("reports CHUNK_COUNT_MISMATCH when row count differs from manifest", async () => {
      const rows = [makeRow("doc.md", 0), makeRow("doc.md", 1)]; // 2 rows
      const store = makeStore(makeTable(rows));
      const parser = makeParser([
        { FileName: "doc.md", ChunkCount: 3, EmbeddingModel: "test-model" }, // manifest says 3
      ]);

      const { issues } = await new IntegrityCheck(store, parser).scan();

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("CHUNK_COUNT_MISMATCH");
      expect(issues[0].manifestChunkCount).toBe(3);
      expect(issues[0].actualChunkCount).toBe(2);
    });

    it("reports ORPHANED_VECTORS when DB has rows for a file not in manifest", async () => {
      const rows = [makeRow("ghost.md", 0), makeRow("ghost.md", 1)];
      const store = makeStore(makeTable(rows));
      const parser = makeParser([]); // empty manifest

      const { issues, summary } = await new IntegrityCheck(store, parser).scan();

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("ORPHANED_VECTORS");
      expect(issues[0].fileName).toBe("ghost.md");
      expect(issues[0].orphanedChunkCount).toBe(2);
      expect(summary.byType.ORPHANED_VECTORS).toBe(1);
    });

    it("reports MODEL_MISMATCH when row model differs from manifest", async () => {
      const rows = [makeRow("doc.md", 0, "new-model")];
      const store = makeStore(makeTable(rows));
      const parser = makeParser([
        { FileName: "doc.md", ChunkCount: 1, EmbeddingModel: "old-model" },
      ]);

      const { issues } = await new IntegrityCheck(store, parser).scan();

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("MODEL_MISMATCH");
      expect(issues[0].manifestModel).toBe("old-model");
      expect(issues[0].rowModel).toBe("new-model");
    });

    it("does not report MODEL_MISMATCH when either model is absent", async () => {
      const rowsNoModel = [{ FileName: "doc.md", ChunkIndex: 0 }]; // no EmbeddingModel
      const store = makeStore(makeTable(rowsNoModel));
      const parser = makeParser([
        { FileName: "doc.md", ChunkCount: 1, EmbeddingModel: "test-model" },
      ]);

      const { issues } = await new IntegrityCheck(store, parser).scan();

      const modelIssues = issues.filter((i) => i.type === "MODEL_MISMATCH");
      expect(modelIssues).toHaveLength(0);
    });

    it("handles multiple issue types in a single scan", async () => {
      const rows = [
        makeRow("ok.md", 0),           // matches manifest (1 chunk)
        makeRow("orphan.md", 0),        // not in manifest → ORPHANED_VECTORS
        makeRow("orphan.md", 1),
        makeRow("short.md", 0),         // manifest says 3, only 1 row → CHUNK_COUNT_MISMATCH
      ];
      const store = makeStore(makeTable(rows));
      const parser = makeParser([
        { FileName: "ok.md", ChunkCount: 1, EmbeddingModel: "test-model" },
        { FileName: "short.md", ChunkCount: 3, EmbeddingModel: "test-model" },
        { FileName: "missing.md", ChunkCount: 2, EmbeddingModel: "test-model" }, // no DB rows → MISSING_VECTORS
      ]);

      const { issues, summary } = await new IntegrityCheck(store, parser).scan();

      expect(summary.byType.ORPHANED_VECTORS).toBe(1);
      expect(summary.byType.CHUNK_COUNT_MISMATCH).toBe(1);
      expect(summary.byType.MISSING_VECTORS).toBe(1);
      expect(summary.issueCount).toBe(3);
    });

    it("is case-insensitive when matching file names", async () => {
      const rows = [makeRow("Doc.MD", 0), makeRow("Doc.MD", 1)];
      const store = makeStore(makeTable(rows));
      const parser = makeParser([
        { FileName: "doc.md", ChunkCount: 2, EmbeddingModel: "test-model" },
      ]);

      const { issues } = await new IntegrityCheck(store, parser).scan();

      expect(issues).toHaveLength(0);
    });

    it("throws when store is not ready", async () => {
      const store = { isReady: false, table: null };
      const parser = makeParser([]);

      await expect(new IntegrityCheck(store, parser).scan()).rejects.toThrow(
        /not ready/i,
      );
    });
  });

  describe("repair()", () => {
    it("deletes orphaned vectors and returns count of removed chunks", async () => {
      const table = makeTable([]);
      const store = makeStore(table);
      const parser = makeParser([]);
      const checker = new IntegrityCheck(store, parser);

      const issues = [
        { type: "ORPHANED_VECTORS", fileName: "stale.md", orphanedChunkCount: 3 },
      ];

      const { removed } = await checker.repair(issues);

      expect(removed).toBe(3);
      expect(table.delete).toHaveBeenCalledTimes(1);
      expect(table.delete).toHaveBeenCalledWith("FileName = 'stale.md'");
    });

    it("escapes single quotes in file names when deleting", async () => {
      const table = makeTable([]);
      const store = makeStore(table);
      const parser = makeParser([]);
      const checker = new IntegrityCheck(store, parser);

      const issues = [
        {
          type: "ORPHANED_VECTORS",
          fileName: "it's complicated.md",
          orphanedChunkCount: 1,
        },
      ];

      await checker.repair(issues);

      expect(table.delete).toHaveBeenCalledWith(
        "FileName = 'it''s complicated.md'",
      );
    });

    it("does not call delete for non-orphan issues", async () => {
      const table = makeTable([]);
      const store = makeStore(table);
      const parser = makeParser([]);
      const checker = new IntegrityCheck(store, parser);

      const issues = [
        { type: "CHUNK_COUNT_MISMATCH", fileName: "doc.md", manifestChunkCount: 3, actualChunkCount: 2 },
        { type: "MISSING_VECTORS", fileName: "missing.md", manifestChunkCount: 2 },
        { type: "MODEL_MISMATCH", fileName: "model.md", manifestModel: "a", rowModel: "b" },
      ];

      const { removed } = await checker.repair(issues);

      expect(removed).toBe(0);
      expect(table.delete).not.toHaveBeenCalled();
    });

    it("returns { removed: 0 } and does not call delete when no orphans present", async () => {
      const table = makeTable([]);
      const store = makeStore(table);
      const parser = makeParser([]);
      const checker = new IntegrityCheck(store, parser);

      const { removed } = await checker.repair([]);

      expect(removed).toBe(0);
      expect(table.delete).not.toHaveBeenCalled();
    });

    it("handles multiple orphaned files in a single repair call", async () => {
      const table = makeTable([]);
      const store = makeStore(table);
      const parser = makeParser([]);
      const checker = new IntegrityCheck(store, parser);

      const issues = [
        { type: "ORPHANED_VECTORS", fileName: "a.md", orphanedChunkCount: 2 },
        { type: "ORPHANED_VECTORS", fileName: "b.md", orphanedChunkCount: 5 },
      ];

      const { removed } = await checker.repair(issues);

      expect(removed).toBe(7);
      expect(table.delete).toHaveBeenCalledTimes(2);
    });
  });
});
