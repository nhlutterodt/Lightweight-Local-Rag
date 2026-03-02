import { jest } from "@jest/globals";

const mockResults = [
  {
    _distance: 0.1,
    FileName: "doc1.md",
    ChunkIndex: 0,
    ChunkText: "Full text of chunk one with complete content.",
    TextPreview: "Full text of chunk one...",
    HeaderContext: "Doc1 > Introduction",
    EmbeddingModel: "test-embed-model",
    vector: [1, 1, 1, 1],
  },
  {
    _distance: 0.5,
    FileName: "doc2.md",
    ChunkIndex: 0,
    ChunkText: "Full text of chunk two with complete content.",
    TextPreview: "Full text of chunk two...",
    HeaderContext: "Doc2 > Overview",
    EmbeddingModel: "test-embed-model",
    vector: [0.5, 0.5, 0.5, 0.5],
  },
  {
    _distance: 0.9,
    FileName: "doc3.md",
    ChunkIndex: 1,
    ChunkText: "Full text of chunk three with complete content.",
    TextPreview: "Full text of chunk three...",
    HeaderContext: "Doc3 > Details",
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

const mockTable = {
  query: mockQuery,
  search: mockSearch,
  add: jest.fn().mockResolvedValue(true),
  delete: jest.fn().mockResolvedValue(true),
};

export const connect = jest.fn().mockResolvedValue({
  tableNames: jest.fn().mockResolvedValue(["TestIngest", "TestCollection"]),
  openTable: jest.fn().mockResolvedValue(mockTable),
  createTable: jest.fn().mockResolvedValue(mockTable),
});
