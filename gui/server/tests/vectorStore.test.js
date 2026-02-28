/**
 * VectorStore Unit Tests
 *
 * Validates the output shape of findNearest() to ensure metadata field names
 * match what server.js and the client parser (main.js) expect.
 */

import { jest } from "@jest/globals";

// Mock fs/promises to provide synthetic binary and metadata files
const DIMS = 4; // Small dimensions for test speed
const VECTOR_COUNT = 3;
const EMBEDDING_MODEL = "test-embed-model";

// Build a synthetic .vectors.bin buffer
function buildTestBinaryData() {
  // Format: [count: int32LE] [dims: int32LE] [modelNameLen: int32LE] [modelName: utf8] [floats...]
  const modelBytes = Buffer.from(EMBEDDING_MODEL, "utf8");
  const headerSize = 4 + 4 + 4 + modelBytes.length;
  const floatSize = VECTOR_COUNT * DIMS * 4;
  const buf = Buffer.alloc(headerSize + floatSize);

  buf.writeInt32LE(VECTOR_COUNT, 0);
  buf.writeInt32LE(DIMS, 4);
  buf.writeInt32LE(modelBytes.length, 8);
  modelBytes.copy(buf, 12);

  // Write normalized vectors
  const floats = new Float32Array(VECTOR_COUNT * DIMS);
  for (let i = 0; i < VECTOR_COUNT; i++) {
    for (let j = 0; j < DIMS; j++) {
      floats[i * DIMS + j] = (j + 1) / DIMS; // Simple deterministic values
    }
  }
  Buffer.from(floats.buffer).copy(buf, headerSize);

  return buf;
}

// Build synthetic metadata
function buildTestMetadata() {
  return [
    {
      Id: "doc1_0_abc",
      Metadata: {
        Source: "C:/docs/doc1.md",
        FileName: "doc1.md",
        ChunkIndex: 0,
        ChunkText: "Full text of chunk one with complete content.",
        TextPreview: "Full text of chunk one...",
        HeaderContext: "Doc1 > Introduction",
      },
    },
    {
      Id: "doc2_0_def",
      Metadata: {
        Source: "C:/docs/doc2.md",
        FileName: "doc2.md",
        ChunkIndex: 0,
        ChunkText: "Full text of chunk two with complete content.",
        TextPreview: "Full text of chunk two...",
        HeaderContext: "Doc2 > Overview",
      },
    },
    {
      Id: "doc3_0_ghi",
      Metadata: {
        Source: "C:/docs/doc3.md",
        FileName: "doc3.md",
        ChunkIndex: 1,
        ChunkText: "Full text of chunk three with complete content.",
        TextPreview: "Full text of chunk three...",
        HeaderContext: "Doc3 > Details",
      },
    },
  ];
}

// Mock fs/promises
jest.unstable_mockModule("fs/promises", () => ({
  readFile: jest.fn(async (filePath) => {
    if (filePath.endsWith(".bin")) {
      return buildTestBinaryData();
    }
    if (filePath.endsWith(".json")) {
      return JSON.stringify(buildTestMetadata());
    }
    throw new Error(`ENOENT: ${filePath}`);
  }),
}));

const { VectorStore } = await import("../lib/vectorStore.js");

describe("VectorStore", () => {
  let store;

  beforeAll(async () => {
    store = new VectorStore();
    await store.load("test.vectors.bin", "test.metadata.json");
  });

  describe("load()", () => {
    it("should load the correct vector count", () => {
      expect(store.count).toBe(VECTOR_COUNT);
    });

    it("should load the correct dimensions", () => {
      expect(store.dims).toBe(DIMS);
    });

    it("should parse the embedded model name", () => {
      expect(store.model).toBe(EMBEDDING_MODEL);
    });

    it("should have metadata matching vector count", () => {
      expect(store.metadata.length).toBe(VECTOR_COUNT);
    });
  });

  describe("findNearest() output shape", () => {
    let results;

    beforeAll(() => {
      // Use the same vector as stored (ensures high similarity)
      const queryVec = new Float32Array(DIMS);
      for (let j = 0; j < DIMS; j++) {
        queryVec[j] = (j + 1) / DIMS;
      }
      results = store.findNearest(queryVec, 5, 0.0);
    });

    it("should return an array", () => {
      expect(Array.isArray(results)).toBe(true);
    });

    it("results should have score (number)", () => {
      for (const r of results) {
        expect(typeof r.score).toBe("number");
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
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

    it("results should be sorted descending by score", () => {
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe("findNearest() filtering", () => {
    it("should filter out results below minScore", () => {
      const queryVec = new Float32Array(DIMS);
      // Use a very different vector to get low scores
      queryVec[0] = -1;
      queryVec[1] = 0;
      queryVec[2] = 0;
      queryVec[3] = 0;

      const results = store.findNearest(queryVec, 5, 0.99);
      // With a totally mismatched vector and high threshold, should filter everything
      expect(results.length).toBe(0);
    });

    it("should respect topK limit", () => {
      const queryVec = new Float32Array(DIMS);
      for (let j = 0; j < DIMS; j++) queryVec[j] = (j + 1) / DIMS;

      const results = store.findNearest(queryVec, 1, 0.0);
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("model validation", () => {
    it("should throw on model mismatch", () => {
      const queryVec = new Float32Array(DIMS);
      expect(() => {
        store.findNearest(queryVec, 5, 0.0, "wrong-model");
      }).toThrow(/mismatch/i);
    });

    it("should not throw when model matches", () => {
      const queryVec = new Float32Array(DIMS);
      for (let j = 0; j < DIMS; j++) queryVec[j] = 1;
      expect(() => {
        store.findNearest(queryVec, 5, 0.0, EMBEDDING_MODEL);
      }).not.toThrow();
    });
  });
});
