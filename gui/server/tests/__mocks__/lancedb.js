import { jest } from "@jest/globals";

const mockResults = [
  {
    _distance: 0.1,
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
    EmbeddingModel: "test-embed-model",
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
    EmbeddingModel: "test-embed-model",
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
    EmbeddingModel: "test-embed-model",
    vector: [0.1, 0.1, 0.1, 0.1],
  },
];

const mockExecute = jest.fn().mockResolvedValue(mockResults);
const mockLimit = jest
  .fn()
  .mockReturnValue({ execute: mockExecute, toArray: mockExecute });
const mockSearch = jest
  .fn()
  .mockReturnValue({ limit: mockLimit, toArray: mockExecute });
const mockQuery = jest
  .fn()
  .mockReturnValue({ limit: mockLimit, toArray: mockExecute });

// Default schema mock: current schema has SourceId (no migration triggered).
// Override per-test with mockTable.schema.mockResolvedValueOnce(...) for old-schema tests.
const mockSchema = { fields: [{ name: "SourceId" }, { name: "FileName" }, { name: "vector" }] };

const mockTable = {
  query: mockQuery,
  search: mockSearch,
  add: jest.fn().mockResolvedValue(true),
  delete: jest.fn().mockResolvedValue(true),
  update: jest.fn().mockResolvedValue(true),
  schema: jest.fn().mockResolvedValue(mockSchema),
  countRows: jest.fn().mockResolvedValue(10),
  // --- M4: Snapshot API ---
  version: 3,
  listVersions: jest.fn().mockResolvedValue([
    { version: 1, timestamp: new Date("2026-03-10T12:00:00.000Z") },
    { version: 2, timestamp: new Date("2026-03-11T08:30:00.000Z") },
    { version: 3, timestamp: new Date("2026-03-12T14:22:00.000Z") },
  ]),
  checkout: jest.fn().mockResolvedValue(undefined),
  restore: jest.fn().mockResolvedValue(undefined),
  checkoutLatest: jest.fn().mockResolvedValue(undefined),
  cleanupOldVersions: jest.fn().mockResolvedValue(undefined),
};

export const connect = jest.fn().mockResolvedValue({
  tableNames: jest.fn().mockResolvedValue(["TestIngest", "TestCollection"]),
  openTable: jest.fn().mockResolvedValue(mockTable),
  createTable: jest.fn().mockResolvedValue(mockTable),
  dropTable: jest.fn().mockResolvedValue(undefined),
});
