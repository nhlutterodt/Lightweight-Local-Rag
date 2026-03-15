import { jest } from "@jest/globals";
import path from "path";
import fs from "fs";
import os from "os";

// We'll use this object to control mock behavior dynamically across modules
const MOCK_STATE = {
  files: [],
  hashMatch: null,
  isUnchanged: false,
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
      constructor() {}
      async load() {}
      async save() {}
      isUnchanged() {
        return MOCK_STATE.isUnchanged;
      }
      findByHash() {
        return MOCK_STATE.hashMatch;
      }
      addOrUpdate() {}
      remove() {}
      getOrphans() {
        return ["orphan.md"];
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
        return [{ text: "Chunk 1", headerContext: "Ctx" }];
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
    MOCK_STATE.isUnchanged = false;

    mockTable = {
      update: jest.fn(),
      delete: jest.fn(),
      add: jest.fn(),
    };
    mockDb = {
      tableNames: jest.fn().mockResolvedValue(["my_collection"]),
      openTable: jest.fn().mockResolvedValue(mockTable),
      createTable: jest.fn().mockResolvedValue(mockTable),
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
      expect(mockTable.delete).toHaveBeenCalledWith(
        expect.stringContaining("file1.md"),
      );
      expect(mockTable.add).toHaveBeenCalled();
      expect(mockTable.add).toHaveBeenCalledWith([
        expect.objectContaining({
          FileName: "file1.md",
          FileType: "md",
          ChunkType: "content",
          StructuralPath: "Ctx",
        }),
      ]);
      expect(job.progress).toBe("Complete");
    });

    it("should throw error if zero files are found in directory", async () => {
      MOCK_STATE.files = [];
      const job = queue.enqueue(tempDir, "col");
      await expect(queue.executeNodeIngest(job)).rejects.toThrow(
        "Source path contains no eligible files",
      );
    });

    it("should skip files if they are completely unchanged", async () => {
      const testFilePath = path.join(tempDir, "file_unchanged.md");
      fs.writeFileSync(testFilePath, "dummy content");
      MOCK_STATE.files = [testFilePath];
      MOCK_STATE.isUnchanged = true;

      const job = queue.enqueue(tempDir, "col");
      await queue.executeNodeIngest(job);

      expect(ollamaClient.embed).not.toHaveBeenCalled();
    });

    it("should rename files in lanceDb if hash matches but filename differs", async () => {
      const testFilePath = path.join(tempDir, "file_renamed.md");
      fs.writeFileSync(testFilePath, "dummy content");
      MOCK_STATE.files = [testFilePath];
      MOCK_STATE.hashMatch = {
        FileName: "old_name.md",
        ChunkCount: 1,
        FileSize: 10,
      };

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      expect(mockTable.update).toHaveBeenCalledWith({
        where: "FileName = 'old_name.md'",
        values: { FileName: "file_renamed.md" },
      });
      // It skips embedding because content is the same
      expect(ollamaClient.embed).not.toHaveBeenCalled();
    });

    it("should escape single quotes in filenames to prevent LanceDB filter injection", async () => {
      const testFilePath = path.join(tempDir, "file_renamed.md");
      fs.writeFileSync(testFilePath, "dummy content");
      MOCK_STATE.files = [testFilePath];
      MOCK_STATE.hashMatch = {
        FileName: "attacker's_file.md",
        ChunkCount: 1,
        FileSize: 10,
      };

      const job = queue.enqueue(tempDir, "my_collection");
      await queue.executeNodeIngest(job);

      expect(mockTable.update).toHaveBeenCalledWith({
        where: "FileName = 'attacker''s_file.md'",
        values: { FileName: "file_renamed.md" },
      });
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
  });
});
