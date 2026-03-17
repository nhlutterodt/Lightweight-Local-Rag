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
 * Creates a minimal mock DocumentParser keyed by sourceId.
 * @param {{ SourceId: string, FileName: string, ChunkCount: number, EmbeddingModel?: string }[]} entries
 */
function makeParser(entries) {
  const map = new Map(entries.map((e) => [e.SourceId, e]));
  return {
    entries: map,
    count: () => map.size,
    getEntry: (sourceId) => map.get(sourceId) ?? null,
  };
}

/** Builds a minimal vector row with SourceId. */
function makeRow(sourceId, fileName, chunkIndex = 0, model = "test-model") {
  return { SourceId: sourceId, FileName: fileName, ChunkIndex: chunkIndex, EmbeddingModel: model };
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
      const rows = [
        makeRow("src_doc1_id12345678", "doc1.md", 0),
        makeRow("src_doc1_id12345678", "doc1.md", 1),
      ];
      const store = makeStore(makeTable(rows));
      const parser = makeParser([
        { SourceId: "src_doc1_id12345678", FileName: "doc1.md", ChunkCount: 2, EmbeddingModel: "test-model" },
      ]);

      const { issues, summary } = await new IntegrityCheck(store, parser).scan();

      expect(issues).toHaveLength(0);
      expect(summary.issueCount).toBe(0);
      expect(summary.totalManifestEntries).toBe(1);
      expect(summary.totalVectorSourceIds).toBe(1);
      expect(summary.totalVectorRows).toBe(2);
    });

    it("reports MISSING_VECTORS when manifest entry has no rows in DB", async () => {
      const store = makeStore(makeTable([]));
      const parser = makeParser([
        { SourceId: "src_missing12345678", FileName: "missing.md", ChunkCount: 3, EmbeddingModel: "test-model" },
      ]);

      const { issues, summary } = await new IntegrityCheck(store, parser).scan();

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("MISSING_VECTORS");
      expect(issues[0].sourceId).toBe("src_missing12345678");
      expect(issues[0].fileName).toBe("missing.md");
      expect(issues[0].manifestChunkCount).toBe(3);
      expect(summary.byType.MISSING_VECTORS).toBe(1);
    });

    it("reports CHUNK_COUNT_MISMATCH when row count differs from manifest", async () => {
      const rows = [
        makeRow("src_doc_id123456789", "doc.md", 0),
        makeRow("src_doc_id123456789", "doc.md", 1),
      ]; // 2 rows
      const store = makeStore(makeTable(rows));
      const parser = makeParser([
        { SourceId: "src_doc_id123456789", FileName: "doc.md", ChunkCount: 3, EmbeddingModel: "test-model" }, // manifest says 3
      ]);

      const { issues } = await new IntegrityCheck(store, parser).scan();

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("CHUNK_COUNT_MISMATCH");
      expect(issues[0].sourceId).toBe("src_doc_id123456789");
      expect(issues[0].manifestChunkCount).toBe(3);
      expect(issues[0].actualChunkCount).toBe(2);
    });

    it("reports ORPHANED_VECTORS when DB has rows for a sourceId not in manifest", async () => {
      const rows = [
        makeRow("src_ghost_id12345678", "ghost.md", 0),
        makeRow("src_ghost_id12345678", "ghost.md", 1),
      ];
      const store = makeStore(makeTable(rows));
      const parser = makeParser([]); // empty manifest

      const { issues, summary } = await new IntegrityCheck(store, parser).scan();

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("ORPHANED_VECTORS");
      expect(issues[0].sourceId).toBe("src_ghost_id12345678");
      expect(issues[0].fileName).toBe("ghost.md");
      expect(issues[0].orphanedChunkCount).toBe(2);
      expect(summary.byType.ORPHANED_VECTORS).toBe(1);
    });

    it("reports MODEL_MISMATCH when row model differs from manifest", async () => {
      const rows = [makeRow("src_model_id12345678", "doc.md", 0, "new-model")];
      const store = makeStore(makeTable(rows));
      const parser = makeParser([
        { SourceId: "src_model_id12345678", FileName: "doc.md", ChunkCount: 1, EmbeddingModel: "old-model" },
      ]);

      const { issues } = await new IntegrityCheck(store, parser).scan();

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("MODEL_MISMATCH");
      expect(issues[0].sourceId).toBe("src_model_id12345678");
      expect(issues[0].manifestModel).toBe("old-model");
      expect(issues[0].rowModel).toBe("new-model");
    });

    it("does not report MODEL_MISMATCH when either model is absent", async () => {
      const rowsNoModel = [{ SourceId: "src_nomodel_1234567", FileName: "doc.md", ChunkIndex: 0 }];
      const store = makeStore(makeTable(rowsNoModel));
      const parser = makeParser([
        { SourceId: "src_nomodel_1234567", FileName: "doc.md", ChunkCount: 1, EmbeddingModel: "test-model" },
      ]);

      const { issues } = await new IntegrityCheck(store, parser).scan();

      expect(issues.filter((i) => i.type === "MODEL_MISMATCH")).toHaveLength(0);
    });

    it("handles multiple issue types in a single scan", async () => {
      const rows = [
        makeRow("src_ok_id123456789a", "ok.md", 0),
        makeRow("src_orphan_id12345a", "orphan.md", 0),
        makeRow("src_orphan_id12345a", "orphan.md", 1),
        makeRow("src_short_id12345ab", "short.md", 0),
      ];
      const store = makeStore(makeTable(rows));
      const parser = makeParser([
        { SourceId: "src_ok_id123456789a", FileName: "ok.md", ChunkCount: 1, EmbeddingModel: "test-model" },
        { SourceId: "src_short_id12345ab", FileName: "short.md", ChunkCount: 3, EmbeddingModel: "test-model" },
        { SourceId: "src_missing_id1234a", FileName: "missing.md", ChunkCount: 2, EmbeddingModel: "test-model" },
      ]);

      const { issues, summary } = await new IntegrityCheck(store, parser).scan();

      expect(summary.byType.ORPHANED_VECTORS).toBe(1);
      expect(summary.byType.CHUNK_COUNT_MISMATCH).toBe(1);
      expect(summary.byType.MISSING_VECTORS).toBe(1);
      expect(summary.issueCount).toBe(3);
    });

    it("disambiguates duplicate basenames by sourceId, not by FileName", async () => {
      // Two files with the same basename but different sourceIds must not
      // be conflated — this is the duplicate-basename requirement from the decision record.
      const rows = [
        makeRow("src_dir1_report_1234", "report.md", 0),
        makeRow("src_dir2_report_5678", "report.md", 0),
      ];
      const store = makeStore(makeTable(rows));
      const parser = makeParser([
        { SourceId: "src_dir1_report_1234", FileName: "report.md", ChunkCount: 1, EmbeddingModel: "test-model" },
        { SourceId: "src_dir2_report_5678", FileName: "report.md", ChunkCount: 1, EmbeddingModel: "test-model" },
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
    it("deletes orphaned vectors by sourceId and returns count of removed chunks", async () => {
      const table = makeTable([]);
      const store = makeStore(table);
      const parser = makeParser([]);
      const checker = new IntegrityCheck(store, parser);

      const issues = [
        { type: "ORPHANED_VECTORS", sourceId: "src_stale_id12345678", fileName: "stale.md", orphanedChunkCount: 3 },
      ];

      const { removed } = await checker.repair(issues);

      expect(removed).toBe(3);
      expect(table.delete).toHaveBeenCalledTimes(1);
      expect(table.delete).toHaveBeenCalledWith("SourceId = 'src_stale_id12345678'");
    });

    it("does not call delete for non-orphan issues", async () => {
      const table = makeTable([]);
      const store = makeStore(table);
      const parser = makeParser([]);
      const checker = new IntegrityCheck(store, parser);

      const issues = [
        { type: "CHUNK_COUNT_MISMATCH", sourceId: "src_aaa", fileName: "doc.md", manifestChunkCount: 3, actualChunkCount: 2 },
        { type: "MISSING_VECTORS", sourceId: "src_bbb", fileName: "missing.md", manifestChunkCount: 2 },
        { type: "MODEL_MISMATCH", sourceId: "src_ccc", fileName: "model.md", manifestModel: "a", rowModel: "b" },
      ];

      const { removed } = await checker.repair(issues);

      expect(removed).toBe(0);
      expect(table.delete).not.toHaveBeenCalled();
    });

    it("returns { removed: 0 } and does not call delete when no orphans present", async () => {
      const table = makeTable([]);
      const store = makeStore(table);
      const parser = makeParser([]);

      const { removed } = await new IntegrityCheck(store, parser).repair([]);

      expect(removed).toBe(0);
      expect(table.delete).not.toHaveBeenCalled();
    });

    it("handles multiple orphaned sourceIds in a single repair call", async () => {
      const table = makeTable([]);
      const store = makeStore(table);
      const parser = makeParser([]);
      const checker = new IntegrityCheck(store, parser);

      const issues = [
        { type: "ORPHANED_VECTORS", sourceId: "src_aaa1234567890ab", fileName: "a.md", orphanedChunkCount: 2 },
        { type: "ORPHANED_VECTORS", sourceId: "src_bbb1234567890ab", fileName: "b.md", orphanedChunkCount: 5 },
      ];

      const { removed } = await checker.repair(issues);

      expect(removed).toBe(7);
      expect(table.delete).toHaveBeenCalledTimes(2);
      expect(table.delete).toHaveBeenCalledWith("SourceId = 'src_aaa1234567890ab'");
      expect(table.delete).toHaveBeenCalledWith("SourceId = 'src_bbb1234567890ab'");
    });
  });
});
