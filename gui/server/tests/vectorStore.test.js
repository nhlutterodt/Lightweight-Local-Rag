/**
 * VectorStore Unit Tests (LanceDB Wrapper)
 *
 * Validates the output shape of findNearest() to ensure metadata field names
 * match what server.js and the client parser (main.js) expect.
 */

import { jest } from "@jest/globals";

const DIMS = 4;
const VECTOR_COUNT = 3;
const EMBEDDING_MODEL = "test-embed-model";
const TABLE_NAME = "TestCollection";

// Build synthetic metadata and vectors mimicking LanceDB's output
function buildMockResults() {
  return [
    {
      _distance: 0.1, // LanceDB returns distance, not score directly
      SourceId: "src_doc1id1234567890",
      ChunkHash: "abc1234567890123",
      chunkOrdinal: 0,
      LocatorType: "section",
      FileName: "doc1.md",
      FileType: "markdown",
      ChunkIndex: 0,
      ChunkText: "Full text of chunk one with complete content.",
      TextPreview: "Full text of chunk one...",
      HeaderContext: "Doc1 > Introduction",
      ChunkType: "paragraph",
      StructuralPath: "Doc1 > Introduction",
      SectionPath: "Doc1 > Introduction",
      EmbeddingModel: EMBEDDING_MODEL,
      vector: [1, 1, 1, 1],
    },
    {
      _distance: 0.5,
      SourceId: "src_doc2id1234567890",
      ChunkHash: "def1234567890123",
      chunkOrdinal: 0,
      LocatorType: "section",
      FileName: "doc2.md",
      FileType: "markdown",
      ChunkIndex: 0,
      ChunkText: "Full text of chunk two with complete content.",
      TextPreview: "Full text of chunk two...",
      HeaderContext: "Doc2 > Overview",
      ChunkType: "paragraph",
      StructuralPath: "Doc2 > Overview",
      SectionPath: "Doc2 > Overview",
      EmbeddingModel: EMBEDDING_MODEL,
      vector: [0.5, 0.5, 0.5, 0.5],
    },
    {
      _distance: 0.9,
      SourceId: "src_ps1id12345678901",
      ChunkHash: "ghi1234567890123",
      chunkOrdinal: 1,
      LocatorType: "declaration",
      FileName: "script.ps1",
      FileType: "powershell",
      ChunkIndex: 1,
      ChunkText: "Full text of chunk three with complete content.",
      TextPreview: "Full text of chunk three...",
      HeaderContext: "Doc3 > Details",
      ChunkType: "declaration",
      StructuralPath: "Script > Function",
      SymbolName: "Invoke-Thing",
      EmbeddingModel: EMBEDDING_MODEL,
      vector: [0.1, 0.1, 0.1, 0.1],
    },
  ];
}

// Global mock for @lancedb/lancedb is handled via jest.config.js moduleNameMapper

const { VectorStore } = await import("../lib/vectorStore.js");

describe("VectorStore (LanceDB Wrapper)", () => {
  let store;

  beforeAll(async () => {
    store = new VectorStore();
    await store.load("Data/mock.lance", TABLE_NAME, EMBEDDING_MODEL);
  });

  describe("load()", () => {
    it("should initialize as ready", () => {
      expect(store.isReady).toBe(true);
    });

    it("should infer dimensions from the first row natively", () => {
      expect(store.dims).toBe(DIMS);
    });

    it("should parse the embedded model name", () => {
      expect(store.model).toBe(EMBEDDING_MODEL);
    });
  });

  describe("findNearest() output shape", () => {
    let results;

    beforeAll(async () => {
      const queryVec = new Float32Array(DIMS);
      for (let j = 0; j < DIMS; j++) {
        queryVec[j] = (j + 1) / DIMS;
      }
      results = await store.findNearest(queryVec, 5, 0.0);
    });

    it("should return an array", () => {
      expect(Array.isArray(results)).toBe(true);
    });

    it("results should have normalized higher-is-better relevance scores", () => {
      for (const r of results) {
        expect(typeof r.score).toBe("number");
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }

      expect(results[0].score).toBeCloseTo(1 / 1.1, 5);
      expect(results[1].score).toBeCloseTo(1 / 1.5, 5);
      expect(results[2].score).toBeCloseTo(1 / 1.9, 5);
    });

    it("should keep results sorted by descending relevance score", () => {
      expect(results[0].score).toBeGreaterThan(results[1].score);
      expect(results[1].score).toBeGreaterThan(results[2].score);
    });

    it("should apply MinScore against the normalized relevance score", async () => {
      const queryVec = new Float32Array(DIMS);
      const filteredResults = await store.findNearest(queryVec, 5, 0.7);

      expect(filteredResults).toHaveLength(1);
      expect(filteredResults[0].FileName).toBe("doc1.md");
    });

    it("results should have ChunkText (string)", () => {
      for (const r of results) {
        expect(typeof r.ChunkText).toBe("string");
        expect(r.ChunkText.length).toBeGreaterThan(0);
      }
    });

    it("results should have TextPreview (string)", () => {
      for (const r of results) {
        expect(typeof r.TextPreview).toBe("string");
      }
    });

    it("results should have FileName (not file)", () => {
      for (const r of results) {
        expect(typeof r.FileName).toBe("string");
        expect(r.FileName.length).toBeGreaterThan(0);
        // Ensure the incorrect key is NOT returned
        expect(r).not.toHaveProperty("file");
      }
    });

    it("results should have ChunkIndex (number)", () => {
      for (const r of results) {
        expect(typeof r.ChunkIndex).toBe("number");
      }
    });

    it("results should pass through SourceId from stored row", () => {
      expect(results[0].SourceId).toBe("src_doc1id1234567890");
      expect(results[1].SourceId).toBe("src_doc2id1234567890");
      expect(results[2].SourceId).toBe("src_ps1id12345678901");
    });

    it("results should pass through ChunkHash from stored row", () => {
      expect(results[0].ChunkHash).toBe("abc1234567890123");
      expect(results[1].ChunkHash).toBe("def1234567890123");
      expect(results[2].ChunkHash).toBe("ghi1234567890123");
    });

    it("results should expose chunkOrdinal, preferring stored chunkOrdinal over ChunkIndex", () => {
      for (const r of results) {
        expect(typeof r.chunkOrdinal).toBe("number");
      }
      expect(results[2].chunkOrdinal).toBe(1);
    });

    it("results should pass through LocatorType from stored row", () => {
      expect(results[0].LocatorType).toBe("section");
      expect(results[1].LocatorType).toBe("section");
      expect(results[2].LocatorType).toBe("declaration");
    });

    it("results should have HeaderContext (string)", () => {
      for (const r of results) {
        expect(typeof r.HeaderContext).toBe("string");
      }
    });

    it("results should include ingestion metadata fields for retrieval modes", () => {
      for (const r of results) {
        expect(typeof r.FileType).toBe("string");
        expect(typeof r.ChunkType).toBe("string");
        expect(typeof r.StructuralPath).toBe("string");
      }
    });

    it("results should pass through explicit sectionPath and symbolName when stored", () => {
      expect(results[0].SectionPath).toBe("Doc1 > Introduction");
      expect(results[1].SectionPath).toBe("Doc2 > Overview");
      expect(results[2].SymbolName).toBe("Invoke-Thing");
    });

    it("supports strict metadata filtering with vector backfill in filtered-vector mode", async () => {
      const queryVec = new Float32Array(DIMS);
      const filteredResults = await store.findNearest(queryVec, 5, 0, {
        overfetchFactor: 4,
        strictFilter: true,
        metadataFilters: {
          fileTypeEquals: "powershell",
        },
      });

      expect(filteredResults).toHaveLength(3);
      expect(filteredResults[0].FileName).toBe("script.ps1");
    });

    it("allows strict-only mode by disabling strict backfill", async () => {
      const queryVec = new Float32Array(DIMS);
      const filteredResults = await store.findNearest(queryVec, 5, 0, {
        overfetchFactor: 4,
        strictFilter: true,
        strictBackfill: false,
        metadataFilters: {
          fileTypeEquals: "powershell",
        },
      });

      expect(filteredResults).toHaveLength(1);
      expect(filteredResults[0].FileName).toBe("script.ps1");
    });
  });

  describe("model validation", () => {
    it("should throw on model mismatch during load", async () => {
      const badStore = new VectorStore();
      await expect(
        badStore.load("Data/mock.lance", TABLE_NAME, "wrong-model"),
      ).rejects.toThrow(/mismatch/i);
    });
  });
});
