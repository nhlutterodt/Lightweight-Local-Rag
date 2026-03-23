import { jest } from "@jest/globals";
import path from "path";
import fs from "fs";
import os from "os";

// We'll use this object to control mock behavior dynamically across modules
const MOCK_STATE = {
  files: [],
  // null = new file; object with SourceId/FileName/ChunkCount/FileSize = existing entry
  hashMatch: null,
  // null = no existing entry by name; object = content-changed file with existing sourceId
  entryByFileName: null,
  // sourceIds returned by getOrphans (not filenames)
  orphanSourceIds: ["src_orphan12345678"],
  chunkerResult: [
    { text: "Chunk 1", headerContext: "Ctx", locatorType: "section" },
  ],
};

// --- Mocks ---
jest.unstable_mockModule("@lancedb/lancedb", () => ({
  connect: jest.fn(),
}));

jest.unstable_mockModule("../lib/ollamaClient.js", () => ({
  embed: jest.fn(),
}));

jest.unstable_mockModule("../lib/documentParser.js", () => {
  return {
    DocumentParser: class MockDocParser {
      constructor() { this.entries = new Map(); }
      async load() {}
      async save() {}
      findByHash() {
        return MOCK_STATE.hashMatch;
      }
      getEntryByFileName() {
        return MOCK_STATE.entryByFileName;
      }
      getEntry(sourceId) {
        // Return the entry if its SourceId matches (used for orphan lookups)
        if (MOCK_STATE.hashMatch?.SourceId === sourceId) return MOCK_STATE.hashMatch;
        return null;
      }
      addOrUpdate() {}
      updateEntry() {}
      remove() {}
      getOrphans() {
        return MOCK_STATE.orphanSourceIds;
      }
      static async scanDirectory() {
        return MOCK_STATE.files;
      }
      static async getFileHash() {
        return "HASH123";
      }
    },
  };
});

jest.unstable_mockModule("../lib/smartChunker.js", () => {
  return {
    SmartTextChunker: class MockChunker {
      dispatchByExtension() {
        return MOCK_STATE.chunkerResult;
      }
    },
  };
});

// Load the module after mocking
const lancedb = await import("@lancedb/lancedb");
const ollamaClient = await import("../lib/ollamaClient.js");
const { default: IngestionQueue } = await import("../IngestionQueue.js");

describe("IngestionQueue", () => {
  let tempDir;
  let queue;
  let mockTable;
  let mockDb;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queue-test-"));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    queue = new IngestionQueue();
    // Use manual config injection
    queue.setConfig({
      Paths: { DataDir: tempDir },
      RAG: { ChunkSize: 100, ChunkOverlap: 20 },
    });

    MOCK_STATE.files = [];
    MOCK_STATE.hashMatch = null;
    MOCK_STATE.entryByFileName = null;
    MOCK_STATE.orphanSourceIds = ["src_orphan12345678"];
    MOCK_STATE.chunkerResult = [
      { text: "Chunk 1", headerContext: "Ctx", locatorType: "section" },
    ];

    mockTable = {
      update: jest.fn(),
      delete: jest.fn(),
      add: jest.fn(),
      schema: jest.fn().mockResolvedValue({
        fields: [{ name: "SourceId" }, { name: "FileName" }, { name: "vector" }],
      }),
    };
    mockDb = {
      tableNames: jest.fn().mockResolvedValue(["my_collection"]),
      openTable: jest.fn().mockResolvedValue(mockTable),
      createTable: jest.fn().mockResolvedValue(mockTable),
      dropTable: jest.fn().mockResolvedValue(undefined),
    };
    lancedb.connect.mockResolvedValue(mockDb);
    ollamaClient.embed.mockResolvedValue(new Float32Array([0.5, 0.6]));

    jest.spyOn(queue, "processNext").mockImplementation(async () => {});
  });

  afterEach(async () => {
    // Stop any pending processes
    queue.isWorking = false;
    queue.jobs = [];

    try {
      jest.useRealTimers();
    } catch {}

    try {
      await queue.shutdown();
    } catch {}

    try {
      if (fs.existsSync(queue.persistencePath)) {
        fs.unlinkSync(queue.persistencePath);
      }

      const tempQueueFile = `${queue.persistencePath}.tmp`;
      if (fs.existsSync(tempQueueFile)) {
        fs.unlinkSync(tempQueueFile);
      }

      const corruptBackups = fs
        .readdirSync(tempDir)
        .filter((name) => name.startsWith("queue.json.corrupt-"));
      for (const backup of corruptBackups) {
        fs.unlinkSync(path.join(tempDir, backup));
      }
    } catch (e) {}
  });

  describe("Initialization & Persistence", () => {
    it("should initialize data directory and persistence path", () => {
      expect(fs.existsSync(tempDir)).toBe(true);
      expect(queue.persistencePath).toBe(path.join(tempDir, "queue.json"));
    });

    it("should save and load state correctly", async () => {
      jest.useFakeTimers();
      queue.jobs = [
        { id: "1", status: "completed" },
        { id: "2", status: "processing" }, // Should reset to failed on load
      ];
      queue.saveState();
      await queue.flushPersistence();

      const newQueue = new IngestionQueue();
      newQueue.setConfig({ Paths: { DataDir: tempDir } });
      jest.runAllTimers();
      jest.useRealTimers();

      expect(newQueue.jobs.length).toBe(2);
      const completedJob = newQueue.jobs.find((job) => job.id === "1");
      const interruptedJob = newQueue.jobs.find((job) => job.id === "2");

      expect(completedJob.status).toBe("completed");
      expect(interruptedJob.status).toBe("failed");
      expect(interruptedJob.progress).toContain("Interrupted");
    });

    it("should emit an update event on save", (done) => {
      queue.on("update", (jobs) => {
        expect(jobs).toEqual(queue.jobs);
        done();
      });
      queue.saveState();
      queue.flushUpdateEmit();
    });

    it("should persist queue state as a versioned envelope", async () => {
      queue.jobs = [{ id: "1", status: "pending" }];
      queue.saveState();
      await queue.flushPersistence();

      const persisted = JSON.parse(fs.readFileSync(queue.persistencePath, "utf8"));
      expect(persisted).toHaveProperty("schemaVersion", 1);
      expect(persisted).toHaveProperty("updatedAt");
      expect(Array.isArray(persisted.jobs)).toBe(true);
      expect(persisted.jobs[0].id).toBe("1");
    });

    it("should prune terminal jobs based on retention limit", async () => {
      queue.maxTerminalJobs = 2;
      queue.jobs = [
        { id: "pending-1", status: "pending", addedAt: "2026-01-01T00:00:00.000Z" },
        { id: "done-1", status: "completed", completedAt: "2026-01-01T00:00:00.000Z" },
        { id: "done-2", status: "failed", completedAt: "2026-01-02T00:00:00.000Z" },
        { id: "done-3", status: "cancelled", completedAt: "2026-01-03T00:00:00.000Z" },
      ];

      queue.saveState();
      await queue.flushPersistence();

      const ids = queue.jobs.map((job) => job.id);
      expect(ids).toContain("pending-1");
      expect(ids).toContain("done-3");
      expect(ids).toContain("done-2");
      expect(ids).not.toContain("done-1");
    });

    it("should fallback safely when queue state is corrupt", () => {
      fs.writeFileSync(queue.persistencePath, "{ this is not valid json", "utf8");

      const newQueue = new IngestionQueue();
      newQueue.setConfig({ Paths: { DataDir: tempDir } });

      expect(newQueue.jobs).toEqual([]);
      const backups = fs
        .readdirSync(tempDir)
        .filter((name) => name.startsWith("queue.json.corrupt-"));
      expect(backups.length).toBeGreaterThan(0);
    });

    it("should debounce burst save requests and persist latest state", async () => {
      queue.persistDebounceMs = 50;

      const atomicSpy = jest.spyOn(queue, "_atomicWriteJson");
      queue.jobs = [{ id: "seed", status: "pending" }];
      queue.saveState();
      queue.jobs.push({ id: "latest", status: "completed" });
      queue.saveState();
      queue.saveState();

      await new Promise((resolve) => setTimeout(resolve, 80));
      await queue.flushPersistence();

      expect(atomicSpy.mock.calls.length).toBeLessThanOrEqual(2);
      const persisted = JSON.parse(fs.readFileSync(queue.persistencePath, "utf8"));
      const ids = persisted.jobs.map((job) => job.id);
      expect(ids).toContain("latest");

      atomicSpy.mockRestore();
    });

    it("should perform one trailing persist when updates arrive during write", async () => {
      const writes = [];
      queue.persistDebounceMs = 0;

      const atomicSpy = jest
        .spyOn(queue, "_atomicWriteJson")
        .mockImplementation(async (filePath, payload) => {
          writes.push(payload.jobs.length);
          if (writes.length === 1) {
            queue.jobs.push({ id: "late", status: "pending" });
            queue.saveState();
          }
          await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
        });

      queue.jobs = [{ id: "initial", status: "pending" }];
      queue.saveState();
      await queue.flushPersistence();

      expect(writes.length).toBe(2);
      expect(queue.jobs.some((j) => j.id === "late")).toBe(true);

      atomicSpy.mockRestore();
    });

    it("should coalesce burst queue updates into bounded stream events", async () => {
      queue.persistDebounceMs = 40;
      queue.updateEmitDebounceMs = 40;
      queue.resetDebugMetrics();

      const streamEvents = [];
      queue.on("update", (jobs) => {
        streamEvents.push(jobs.map((j) => `${j.id}:${j.status}`).join("|"));
      });

      for (let i = 0; i < 100; i += 1) {
        queue.jobs = [{ id: `job-${i}`, status: "pending" }];
        queue.saveState();
      }

      await new Promise((resolve) => setTimeout(resolve, 130));
      queue.flushUpdateEmit();
      await queue.flushPersistence();

      const metrics = queue.getDebugMetrics();
      expect(metrics.saveRequests).toBe(100);
      expect(metrics.updateEventsEmitted).toBe(streamEvents.length);
      expect(metrics.updateEventsEmitted).toBeGreaterThanOrEqual(1);
      expect(metrics.updateEventsEmitted).toBeLessThanOrEqual(2);
      expect(metrics.persistenceWrites).toBeLessThanOrEqual(2);
    });

    it("captures before/after metrics for 100 queue updates", async () => {
      const runBurst = async ({ flushEverySave }) => {
        queue.jobs = [];
        queue.resetDebugMetrics();
        queue._lastEmitSignature = null;

        const eventLog = [];
        const onUpdate = (jobs) => {
          eventLog.push(jobs.length);
        };
        queue.on("update", onUpdate);

        for (let i = 0; i < 100; i += 1) {
          queue.jobs = [
            {
              id: "burst-job",
              status: "processing",
              progress: `step-${i}`,
            },
          ];
          queue.saveState();
          if (flushEverySave) {
            queue.flushUpdateEmit();
            await queue.flushPersistence();
          }
        }

        if (!flushEverySave) {
          await new Promise((resolve) => setTimeout(resolve, 130));
          queue.flushUpdateEmit();
          await queue.flushPersistence();
        }

        queue.removeListener("update", onUpdate);
        return {
          ...queue.getDebugMetrics(),
          streamMessages: eventLog.length,
        };
      };

      queue.persistDebounceMs = 0;
      queue.updateEmitDebounceMs = 0;
      const baseline = await runBurst({ flushEverySave: true });

      queue.persistDebounceMs = 40;
      queue.updateEmitDebounceMs = 40;
      const optimized = await runBurst({ flushEverySave: false });

      expect(baseline.saveRequests).toBe(100);
      expect(optimized.saveRequests).toBe(100);
      expect(baseline.streamMessages).toBe(100);
      expect(optimized.streamMessages).toBeGreaterThanOrEqual(1);
      expect(optimized.streamMessages).toBeLessThanOrEqual(2);
      expect(baseline.persistenceWrites).toBe(100);
      expect(optimized.persistenceWrites).toBeLessThanOrEqual(2);
      expect(optimized.streamMessages).toBeLessThan(baseline.streamMessages);
      expect(optimized.persistenceWrites).toBeLessThan(baseline.persistenceWrites);

      console.log("[Queue Burst Metrics]", {
        saveRequests: baseline.saveRequests,
        streamMessagesBaseline: baseline.streamMessages,
        streamMessagesOptimized: optimized.streamMessages,
        persistenceWritesBaseline: baseline.persistenceWrites,
        persistenceWritesOptimized: optimized.persistenceWrites,
      });
    });
  });

  describe("Job Enqueueing & Cancellation", () => {
    it("should enqueue a job and trigger processing", () => {
      const job = queue.enqueue("/some/path", "my_collection");

      expect(job.id).toBeDefined();
      expect(job.status).toBe("pending");
      expect(job.path).toBe("/some/path");
      expect(queue.jobs.length).toBe(1);
    });

    it("should cancel a pending job", () => {
      const job = queue.enqueue("/some/path", "my_col");
      const cancelled = queue.cancelJob(job.id);
      expect(cancelled).toBe(true);
      expect(job.status).toBe("cancelled");
    });

    it("should not cancel a non-pending job", () => {
      const job = queue.enqueue("/some/path", "my_col");
      job.status = "processing";

      const cancelled = queue.cancelJob(job.id);
      expect(cancelled).toBe(false);
      const notFound = queue.cancelJob("fake-id");
      expect(notFound).toBe(false);
    });

    it("should return the list of jobs safely", () => {
      const jobs = queue.getJobs();
      expect(jobs).toBe(queue.jobs);
    });
  });

  describe("Process Execution Flow", () => {
    it("should process jobs sequentially and handle success", async () => {
      // Re-enable processNext
      queue.processNext.mockRestore();
      const executeSpy = jest
        .spyOn(queue, "executeNodeIngest")
        .mockResolvedValue();

      const job = queue.enqueue("/my/docs", "col");

      await new Promise(process.nextTick);

      expect(executeSpy).toHaveBeenCalledWith(job);
      expect(job.status).toBe("completed");
    });

    it("should handle job failures gracefully and continue", async () => {
      queue.processNext.mockRestore();
      const executeSpy = jest
        .spyOn(queue, "executeNodeIngest")
        .mockRejectedValue(new Error("Ingest Failed"));

      const job = queue.enqueue("/my/docs", "col");

      await new Promise(process.nextTick);

      expect(job.status).toBe("failed");
      expect(job.progress).toContain("Error: Ingest Failed");
    });
  });

  describe("executeNodeIngest", () => {
    it("should execute the full integration pathway", async () => {
      const testFilePath = path.join(tempDir, "file1.md");
      fs.writeFileSync(testFilePath, "dummy content");
      MOCK_STATE.files = [testFilePath];

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      expect(lancedb.connect).toHaveBeenCalled();
      expect(ollamaClient.embed).toHaveBeenCalledWith(
        "Chunk 1",
        "nomic-embed-text",
        "http://localhost:11434",
      );
      expect(mockDb.openTable).toHaveBeenCalledWith("my_collection");
      // Delete must use SourceId predicate (not FileName)
      expect(mockTable.delete).toHaveBeenCalledWith(
        expect.stringMatching(/^SourceId = 'src_/),
      );
      expect(mockTable.add).toHaveBeenCalled();
      expect(mockTable.add).toHaveBeenCalledWith([
        expect.objectContaining({
          FileName: "file1.md",
          FileType: "md",
          ChunkType: "content",
          LocatorType: "section",
          StructuralPath: "Ctx",
        }),
      ]);
      expect(job.progress).toBe("Complete");
    });

    it("mints a new sourceId for a truly new source (no existing manifest entry)", async () => {
      const testFilePath = path.join(tempDir, "brand_new.md");
      fs.writeFileSync(testFilePath, "brand new file content");
      MOCK_STATE.files = [testFilePath];
      // No hash match, no entry by filename → mint new
      MOCK_STATE.hashMatch = null;
      MOCK_STATE.entryByFileName = null;

      const { mintSourceId } = await import("../lib/sourceIdentity.js");
      const expectedSourceId = mintSourceId("my_collection", testFilePath);

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      expect(mockTable.add).toHaveBeenCalledWith([
        expect.objectContaining({ SourceId: expectedSourceId, LocatorType: "section" }),
      ]);
    });

    it("preserves sourceId when file content changes (edit-in-place, lineage continuity)", async () => {
      const testFilePath = path.join(tempDir, "edited.md");
      fs.writeFileSync(testFilePath, "new content version");
      MOCK_STATE.files = [testFilePath];
      MOCK_STATE.hashMatch = null; // no hash match → content changed
      // getEntryByFileName returns an existing entry → preserve its sourceId
      MOCK_STATE.entryByFileName = {
        SourceId: "src_existinglineage1",
        FileName: "edited.md",
        ChunkCount: 2,
      };

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      expect(mockTable.add).toHaveBeenCalledWith([
        expect.objectContaining({ SourceId: "src_existinglineage1", LocatorType: "section" }),
      ]);
    });

    it("should include ChunkHash derived from (SourceId, chunkOrdinal, text) in every LanceDB record", async () => {
      const testFilePath = path.join(tempDir, "file_chunkhash.md");
      fs.writeFileSync(testFilePath, "chunk hash test content");
      MOCK_STATE.files = [testFilePath];

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      const writtenRecord = mockTable.add.mock.calls[0][0][0];
      expect(writtenRecord).toHaveProperty("ChunkHash");
      expect(typeof writtenRecord.ChunkHash).toBe("string");
      expect(writtenRecord.ChunkHash).toMatch(/^[0-9a-f]{16}$/);
      expect(writtenRecord.LocatorType).toBe("section");
    });

    it("persists page bounds when chunk metadata includes pdf page ranges", async () => {
      const testFilePath = path.join(tempDir, "file_pdf_like.md");
      fs.writeFileSync(testFilePath, "pdf-like content");
      MOCK_STATE.files = [testFilePath];
      MOCK_STATE.chunkerResult = [
        {
          text: "Page-bounded chunk",
          headerContext: "sample.pdf > Page 3",
          locatorType: "page-range",
          fileType: "pdf",
          chunkType: "pdf-page",
          structuralPath: "sample.pdf > Page 3",
          pageStart: 3,
          pageEnd: 3,
        },
      ];

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      expect(mockTable.add).toHaveBeenCalledWith([
        expect.objectContaining({
          LocatorType: "page-range",
          PageStart: 3,
          PageEnd: 3,
          FileType: "pdf",
          ChunkType: "pdf-page",
        }),
      ]);
    });

    it("persists explicit sectionPath and symbolName when chunk metadata supports them", async () => {
      const testFilePath = path.join(tempDir, "file_structured.md");
      fs.writeFileSync(testFilePath, "structured content");
      MOCK_STATE.files = [testFilePath];
      MOCK_STATE.chunkerResult = [
        {
          text: "Structured chunk",
          headerContext: "Guide > Install",
          locatorType: "section",
          fileType: "markdown",
          chunkType: "markdown-section",
          structuralPath: "Guide > Install",
          sectionPath: "Guide > Install",
          symbolName: "Install",
        },
      ];

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      expect(mockTable.add).toHaveBeenCalledWith([
        expect.objectContaining({
          LocatorType: "section",
          SectionPath: "Guide > Install",
          SymbolName: "Install",
        }),
      ]);
    });

    it("ChunkHash is stable: same inputs yield same ChunkHash across separate ingest runs", async () => {
      const testFilePath = path.join(tempDir, "file_chunkhash_stable.md");
      fs.writeFileSync(testFilePath, "stable chunk content");
      MOCK_STATE.files = [testFilePath];

      const job1 = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job1);
      const firstChunkHash = mockTable.add.mock.calls[0][0][0].ChunkHash;

      mockTable.add.mockClear();
      const job2 = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job2);
      const secondChunkHash = mockTable.add.mock.calls[0][0][0].ChunkHash;

      expect(firstChunkHash).toBe(secondChunkHash);
    });

    it("stores chunkOrdinal as an explicit sequencing field per chunk", async () => {
      const testFilePath = path.join(tempDir, "file_ordinal.md");
      fs.writeFileSync(testFilePath, "ordinal test content");
      MOCK_STATE.files = [testFilePath];

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      const writtenRecord = mockTable.add.mock.calls[0][0][0];
      expect(writtenRecord).toHaveProperty("chunkOrdinal");
      expect(typeof writtenRecord.chunkOrdinal).toBe("number");
      expect(writtenRecord.chunkOrdinal).toBe(0); // first (and only) chunk
    });

    it("should throw error if zero files are found in directory", async () => {
      MOCK_STATE.files = [];
      const job = queue.enqueue(tempDir, "col");
      await expect(queue.executeNodeIngest(job)).rejects.toThrow(
        "Source path contains no eligible files",
      );
    });

    it("skips files that are completely unchanged (findByHash returns same FileName)", async () => {
      const testFilePath = path.join(tempDir, "file_unchanged.md");
      fs.writeFileSync(testFilePath, "dummy content");
      MOCK_STATE.files = [testFilePath];
      // findByHash returns a match with the same FileName → unchanged, skip
      MOCK_STATE.hashMatch = {
        FileName: "file_unchanged.md",
        SourceId: "src_unchangedid1234",
        ChunkCount: 1,
        FileSize: 12,
      };

      const job = queue.enqueue(tempDir, "col");
      await queue.executeNodeIngest(job);

      expect(ollamaClient.embed).not.toHaveBeenCalled();
    });

    it("rename detection: updates LanceDB by SourceId, calls updateEntry, skips re-embedding", async () => {
      const testFilePath = path.join(tempDir, "file_renamed.md");
      fs.writeFileSync(testFilePath, "dummy content");
      MOCK_STATE.files = [testFilePath];
      MOCK_STATE.hashMatch = {
        FileName: "old_name.md", // different basename → rename detected
        SourceId: "src_oldid123456789a",
        ChunkCount: 1,
        FileSize: 10,
        // No SourcePath → legacy entry; rename detection still applies
      };

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      // Must use SourceId predicate — not FileName — so identity is stable
      expect(mockTable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: "SourceId = 'src_oldid123456789a'",
        }),
      );
      // Content unchanged — no re-embedding
      expect(ollamaClient.embed).not.toHaveBeenCalled();
    });

    // WS1 Acceptance Criteria #1+#2 — RAG_Source_Identity_Decision_Record.md:
    // "Ingesting A/spec.md and B/spec.md into the same collection produces two distinct
    //  manifest entries and two distinct row sets. Re-ingesting one source does not delete
    //  or overwrite the other."  Option B (content-hash identity) was rejected precisely
    // because it collapses two distinct files with identical content into one lineage.
    it("two distinct files with identical content are each ingested as separate sources (WS1 AC#1)", async () => {
      const fileA = path.join(tempDir, "collision_a.md");
      const fileB = path.join(tempDir, "collision_b.md");
      fs.writeFileSync(fileA, "identical content");
      fs.writeFileSync(fileB, "identical content");
      // Both files present in the active scan
      MOCK_STATE.files = [fileA, fileB];
      // findByHash returns fileA's entry (same hash), simulating that fileA has already
      // been processed; fileA's SourcePath is still in the active files list.
      MOCK_STATE.hashMatch = {
        FileName: "collision_a.md",
        SourcePath: fileA, // ← fileA is still on disk → must NOT be treated as rename
        SourceId: "src_filea_collision1234",
        ChunkCount: 1,
        FileSize: 16,
      };
      MOCK_STATE.entryByFileName = null;

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      // fileB must NOT be treated as a rename of fileA:
      //   - no table.update call targeting fileA's SourceId
      const updateCalls = mockTable.update.mock.calls;
      const wrongRename = updateCalls.find((c) =>
        c[0]?.where?.includes("src_filea_collision1234"),
      );
      expect(wrongRename).toBeUndefined();

      // fileB must be embedded and written as a new source with its own SourceId
      expect(ollamaClient.embed).toHaveBeenCalled();
      const addCalls = mockTable.add.mock.calls.flatMap((c) => c[0]);
      expect(addCalls.every((r) => r.SourceId !== "src_filea_collision1234")).toBe(true);
    });

    it("rename detection still works when matched entry has no SourcePath (legacy row)", async () => {
      // Legacy entries stored without SourcePath must still trigger rename detection
      // — backward compat guarantee while migration completes.
      const testFilePath = path.join(tempDir, "file_legacy_rename.md");
      fs.writeFileSync(testFilePath, "legacy content");
      MOCK_STATE.files = [testFilePath];
      MOCK_STATE.hashMatch = {
        FileName: "file_old_legacy.md",
        // SourcePath deliberately absent (legacy entry)
        SourceId: "src_legacyid12345678",
        ChunkCount: 1,
        FileSize: 14,
      };

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      expect(mockTable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: "SourceId = 'src_legacyid12345678'",
        }),
      );
      expect(ollamaClient.embed).not.toHaveBeenCalled();
    });

    it("orphan cleanup deletes by SourceId predicate, not FileName", async () => {
      const testFilePath = path.join(tempDir, "active_file.md");
      fs.writeFileSync(testFilePath, "active content");
      MOCK_STATE.files = [testFilePath];
      MOCK_STATE.hashMatch = null;
      MOCK_STATE.entryByFileName = null;
      MOCK_STATE.orphanSourceIds = ["src_orphandeadbeef12"];

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      const deleteCalls = mockTable.delete.mock.calls.map((c) => c[0]);
      const orphanDelete = deleteCalls.find((d) =>
        d.includes("src_orphandeadbeef12"),
      );
      expect(orphanDelete).toBe("SourceId = 'src_orphandeadbeef12'");
    });

    it("should ignore files with empty content", async () => {
      const testFilePath = path.join(tempDir, "empty.md");
      fs.writeFileSync(testFilePath, "   \n  ");
      MOCK_STATE.files = [testFilePath];

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      expect(ollamaClient.embed).not.toHaveBeenCalled();
    });

    it("should skip files that exceed the 50MB file size limit to prevent memory exhaustion", async () => {
      const testFilePath = path.join(tempDir, "huge.md");
      fs.writeFileSync(testFilePath, "dummy");
      MOCK_STATE.files = [testFilePath];

      const statSpy = jest.spyOn(fs.promises, "stat").mockResolvedValue({
        size: 51 * 1024 * 1024, // 51 MB
      });
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      try {
        const job = queue.enqueue(tempDir, "my_collection");
        await queue.executeNodeIngest(job);

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Exceeds 50MB limit"),
        );
        expect(ollamaClient.embed).not.toHaveBeenCalled();
      } finally {
        statSpy.mockRestore();
        warnSpy.mockRestore();
      }
    });

    it("should create a new collection if table doesn't exist", async () => {
      mockDb.tableNames.mockResolvedValue([]);
      const testFilePath = path.join(tempDir, "new_db.md");
      fs.writeFileSync(testFilePath, "dummy context");
      MOCK_STATE.files = [testFilePath];

      const job = queue.enqueue(tempDir, "new_collection");
      await queue.executeNodeIngest(job);

      expect(mockDb.createTable).toHaveBeenCalledWith(
        "new_collection",
        expect.any(Array),
      );
    });

    it("should swallow errors gracefully if embedding fails", async () => {
      const testFilePath = path.join(tempDir, "embed_fail.md");
      fs.writeFileSync(testFilePath, "dummy context");
      MOCK_STATE.files = [testFilePath];

      ollamaClient.embed.mockRejectedValue(new Error("Network Error"));

      const job = queue.enqueue(tempDir, "col");
      await queue.executeNodeIngest(job);

      expect(ollamaClient.embed).toHaveBeenCalled();
      expect(mockTable.add).not.toHaveBeenCalled(); // Failed to embed, so not added
    });

    it("drops pre-SourceId LanceDB table and clears manifest entries before re-embedding", async () => {
      // Simulate a table that exists but has no SourceId column (old schema).
      const oldSchemaTable = {
        ...mockTable,
        schema: jest.fn().mockResolvedValue({
          fields: [{ name: "FileName" }, { name: "vector" }], // no SourceId
        }),
      };
      mockDb.tableNames.mockResolvedValue(["my_collection"]);
      mockDb.openTable.mockResolvedValueOnce(oldSchemaTable); // probe open
      // Second openTable call (if any, e.g. for add) returns current mockTable
      mockDb.openTable.mockResolvedValue(mockTable);

      const testFilePath = path.join(tempDir, "migrated.md");
      fs.writeFileSync(testFilePath, "content after migration");
      MOCK_STATE.files = [testFilePath];

      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      try {
        const job = queue.enqueue(tempDir, "my_collection");
        await queue.executeNodeIngest(job);

        // Table was dropped
        expect(mockDb.dropTable).toHaveBeenCalledWith("my_collection");
        // After drop the file is treated as new content — embed is called
        expect(ollamaClient.embed).toHaveBeenCalled();
        // Log message identifies the migration action
        const migrationLogs = logSpy.mock.calls.filter(
          (args) => typeof args[0] === "string" && args[0].includes("pre-SourceId schema"),
        );
        expect(migrationLogs.length).toBeGreaterThan(0);
      } finally {
        logSpy.mockRestore();
      }
    });

    it("does NOT drop table when existing table already has SourceId column", async () => {
      // Table exists and already has SourceId — no migration needed.
      mockDb.tableNames.mockResolvedValue(["my_collection"]);
      mockDb.openTable.mockResolvedValue(mockTable); // mockTable.schema returns SourceId

      const testFilePath = path.join(tempDir, "already_v2.md");
      fs.writeFileSync(testFilePath, "v2 content");
      MOCK_STATE.files = [testFilePath];

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      expect(mockDb.dropTable).not.toHaveBeenCalled();
    });
  });

  describe("Schema Migration", () => {
    const queueFile = () => path.join(tempDir, "queue.json");

    function writeQueueFile(content) {
      fs.writeFileSync(queueFile(), JSON.stringify(content), "utf8");
    }

    function loadFreshQueue() {
      const q = new IngestionQueue();
      q.setConfig({ Paths: { DataDir: tempDir } });
      return q;
    }

    afterEach(() => {
      // Clean up any migration-related backup files
      const files = fs.readdirSync(tempDir);
      for (const f of files) {
        if (f.startsWith("queue.json")) {
          fs.unlinkSync(path.join(tempDir, f));
        }
      }
    });

    it("loads current v1 state without applying any migration", () => {
      writeQueueFile({ schemaVersion: 1, jobs: [{ id: "a", status: "completed" }] });
      const q = loadFreshQueue();
      expect(q.jobs.length).toBe(1);
      expect(q.jobs[0].id).toBe("a");
    });

    it("migrates legacy plain-array state (v0) to v1 and loads jobs", () => {
      writeQueueFile([{ id: "b", status: "completed" }]);
      const q = loadFreshQueue();
      expect(q.jobs.length).toBe(1);
      expect(q.jobs[0].id).toBe("b");
    });

    it("warns and resets to empty when state has a future schema version", () => {
      writeQueueFile({ schemaVersion: 999, jobs: [{ id: "c", status: "pending" }] });
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const q = loadFreshQueue();
      warnSpy.mockRestore();

      expect(q.jobs).toEqual([]);
      // A backup file should have been created
      const backups = fs.readdirSync(tempDir).filter((f) => f.startsWith("queue.json.corrupt-"));
      expect(backups.length).toBeGreaterThan(0);
    });

    it("_migrateQueueState returns null for future schema versions", () => {
      const q = new IngestionQueue();
      q.setConfig({ Paths: { DataDir: tempDir } });
      const result = q._migrateQueueState({ schemaVersion: 999, jobs: [] });
      expect(result).toBeNull();
    });

    it("_migrateQueueState returns state unchanged when version equals current", () => {
      const q = new IngestionQueue();
      q.setConfig({ Paths: { DataDir: tempDir } });
      const state = { schemaVersion: 1, jobs: [{ id: "x" }] };
      const result = q._migrateQueueState(state);
      expect(result).toBe(state); // same reference, no copy
    });
  });
});
