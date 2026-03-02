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
      FileName: "doc1.md",
      ChunkIndex: 0,
      ChunkText: "Full text of chunk one with complete content.",
      TextPreview: "Full text of chunk one...",
      HeaderContext: "Doc1 > Introduction",
      EmbeddingModel: EMBEDDING_MODEL,
      vector: [1, 1, 1, 1],
    },
    {
      _distance: 0.5,
      FileName: "doc2.md",
      ChunkIndex: 0,
      ChunkText: "Full text of chunk two with complete content.",
      TextPreview: "Full text of chunk two...",
      HeaderContext: "Doc2 > Overview",
      EmbeddingModel: EMBEDDING_MODEL,
      vector: [0.5, 0.5, 0.5, 0.5],
    },
    {
      _distance: 0.9,
      FileName: "doc3.md",
      ChunkIndex: 1,
      ChunkText: "Full text of chunk three with complete content.",
      TextPreview: "Full text of chunk three...",
      HeaderContext: "Doc3 > Details",
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

    it("results should have score mapped from LanceDB _distance", () => {
      for (const r of results) {
        expect(typeof r.score).toBe("number");
        expect(r.score).toBeGreaterThanOrEqual(0);
      }
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

    it("results should have HeaderContext (string)", () => {
      for (const r of results) {
        expect(typeof r.HeaderContext).toBe("string");
      }
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
