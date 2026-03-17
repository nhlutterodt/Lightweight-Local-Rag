import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";
import * as lancedb from "@lancedb/lancedb";
import * as ollamaClient from "./lib/ollamaClient.js";

import { SmartTextChunker } from "./lib/smartChunker.js";
import { DocumentParser } from "./lib/documentParser.js";
import {
  mintSourceId,
  computeChunkHash,
} from "./lib/sourceIdentity.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import PDFParser from "pdf2json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QUEUE_STATE_VERSION = 1;

/**
 * Migration functions keyed by TARGET version.
 * Each function receives the raw state at (version - 1) and returns state at (version).
 * Version 1 migration handles the pre-versioning plain-array format (v0 → v1).
 */
const QUEUE_MIGRATIONS = {
  1: (raw) => ({
    schemaVersion: 1,
    jobs: Array.isArray(raw) ? raw : (raw?.jobs ?? []),
  }),
  // Future example:
  // 2: (state) => ({ ...state, schemaVersion: 2, newField: "default" }),
};

const DEFAULT_MAX_TERMINAL_JOBS = 200;
const DEFAULT_PERSIST_DEBOUNCE_MS = 200;
const DEFAULT_UPDATE_EMIT_DEBOUNCE_MS = 120;

class IngestionQueue extends EventEmitter {
  constructor() {
    super();
    this.jobs = [];
    this.isWorking = false;
    this._lastSave = 0;
    this.currentJob = null;
    this.config = null;
    this.dataDir = null;
    this.persistencePath = null;
    this.maxTerminalJobs = Number(
      process.env.QUEUE_MAX_TERMINAL_JOBS || DEFAULT_MAX_TERMINAL_JOBS,
    );
    this.persistDebounceMs = Number(
      process.env.QUEUE_PERSIST_DEBOUNCE_MS || DEFAULT_PERSIST_DEBOUNCE_MS,
    );
    this.updateEmitDebounceMs = Number(
      process.env.QUEUE_UPDATE_EMIT_DEBOUNCE_MS ||
        DEFAULT_UPDATE_EMIT_DEBOUNCE_MS,
    );
    this._persistTimer = null;
    this._pendingPersist = false;
    this._isPersisting = false;
    this._emitTimer = null;
    this._pendingEmit = false;
    this._lastEmitSignature = null;
    this._metrics = {
      saveRequests: 0,
      persistenceWrites: 0,
      updateEventsEmitted: 0,
      updateEventsDeduped: 0,
    };
  }

  // Allow server.js to pass down the config cleanly
  setConfig(config) {
    this.config = config;
    const defaultDataDir = path.join(
      __dirname,
      "..",
      "..",
      "PowerShell Scripts",
      "Data",
    );
    this.dataDir = config?.Paths?.DataDir
      ? config.Paths.DataDir
      : defaultDataDir;

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.persistencePath = path.join(this.dataDir, "queue.json");

    // Now that we have the path, load state
    this.loadState();
  }

  enqueue(path, collection) {
    const job = {
      id: Date.now().toString(),
      path,
      collection,
      status: "pending",
      progress: "In Queue",
      addedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };

    this.jobs.push(job);
    this.saveState();
    this.processNext();
    return job;
  }

  async processNext() {
    if (this.isWorking || this.jobs.length === 0) return;

    const job = this.jobs.find((j) => j.status === "pending");
    if (!job) return;

    this.isWorking = true;
    this.currentJob = job;
    job.status = "processing";
    job.startedAt = new Date().toISOString();
    this.saveState();

    console.log(`[Queue] Starting Job ${job.id}: ${job.path}`);

    try {
      await this.executeNodeIngest(job);
      job.status = "completed";
      job.progress = "Complete";
    } catch (err) {
      job.status = "failed";
      job.progress = `Error: ${err.message}`;
      console.error(`[Queue] Job ${job.id} failed:`, err.message);
    } finally {
      job.completedAt = new Date().toISOString();
      this.isWorking = false;
      this.currentJob = null;
      this.saveState();
      this.processNext();
    }
  }

  async executeNodeIngest(job) {
    const model = this.config?.RAG?.EmbeddingModel || "nomic-embed-text";
    const baseUrl = this.config?.RAG?.OllamaUrl || "http://localhost:11434";
    const chunkSize = this.config?.RAG?.ChunkSize || 1000;
    const chunkOverlap = this.config?.RAG?.ChunkOverlap || 200;

    const dbDir = path.join(this.dataDir, "vector_store.lance");

    // 1. Initialize DB and Table configuration
    const db = await lancedb.connect(dbDir);
    const tables = await db.tableNames();
    let table = null;

    // 2. Initialize Parser and Chunker
    const parser = new DocumentParser(this.dataDir, job.collection);
    await parser.load();
    const chunker = new SmartTextChunker(chunkSize, chunkOverlap);

    job.progress = "Scanning directory...";
    this._throttledSave();

    // 3. Scan Files
    const files = await DocumentParser.scanDirectory(job.path);
    if (!files || files.length === 0) {
      throw new Error(`Source path contains no eligible files: ${job.path}`);
    }

    job.progress = `Processing 0 / ${files.length} files`;
    this._throttledSave();

    // 4. Processing Loop
    // activeSourceIds accumulates every sourceId that was seen on disk this run.
    // It is used for orphan detection at the end of the loop.
    const activeSourceIds = new Set();
    let processedCount = 0;

    for (const filePath of files) {
      const fileName = path.basename(filePath);
      job.progress = `Processing ${fileName} (${processedCount + 1}/${files.length})`;
      this._throttledSave();

      const fileHash = await DocumentParser.getFileHash(filePath);

      // Single hash lookup handles both "unchanged" and "rename" checks.
      const hashMatch = parser.findByHash(fileHash);

      if (hashMatch) {
        // Disambiguate by source path before treating as lineage continuity.
        // Two distinct files with identical content must not be collapsed into
        // one sourceId — Option B was rejected for exactly this reason
        // (see RAG_Source_Identity_Decision_Record, WS1 AC#1+#2).
        //
        // sameSource = the matched entry refers to the same logical source:
        //   - exact path match                  → unchanged file at same location
        //   - no SourcePath stored (legacy)      → preserve old rename behaviour
        //   - matched source path absent from    → genuine rename candidate
        //     the current active file scan
        const originalPath = hashMatch.SourcePath;
        const sameSource =
          originalPath === filePath ||
          !originalPath ||
          !files.includes(originalPath);

        if (sameSource) {
          if (hashMatch.FileName === fileName && (!originalPath || originalPath === filePath)) {
            // Unchanged: same path, same basename, same content — skip re-embedding.
            activeSourceIds.add(hashMatch.SourceId);
            processedCount++;
            continue;
          } else {
            // Rename: original path is gone from the active scan; same hash at new path.
            // Preserve the existing sourceId; only update display metadata.
            const sourceId = hashMatch.SourceId;
            if (tables.includes(job.collection)) {
              if (!table) table = await db.openTable(job.collection);
              await table.update({
                where: `SourceId = '${sourceId}'`,
                values: { FileName: fileName, SourcePath: filePath },
              });
            }
            parser.updateEntry(sourceId, {
              FileName: fileName,
              SourcePath: filePath,
            });
            activeSourceIds.add(sourceId);
            processedCount++;
            continue;
          }
        }
        // sameSource = false: different file with coincidentally identical content.
        // Ignore the hash match and fall through to new-ingest path below.
      }

      // New content: either a genuinely new source or an edited existing file.

      // Enforce file size limits to prevent Memory Exhaustion / DoS
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
      let fileStats = null;
      try {
        fileStats = await fs.promises.stat(filePath);
      } catch (statErr) {
        console.warn(
          `[Ingest Warn] Could not stat ${fileName}: ${statErr.message}`,
        );
        processedCount++;
        continue;
      }
      if (fileStats.size > MAX_FILE_SIZE) {
        console.warn(`[Ingest Warn] Skipping ${fileName}: Exceeds 50MB limit.`);
        job.progress = `Skipped ${fileName} (too large)`;
        this._throttledSave();
        processedCount++;
        continue;
      }

      // Read Content
      let content = "";
      try {
        if (filePath.toLowerCase().endsWith(".pdf")) {
          const buffer = await fs.promises.readFile(filePath);

          content = await new Promise((resolve, reject) => {
            const pdfParser = new PDFParser(this, 1);

            pdfParser.on("pdfParser_dataError", (errData) =>
              reject(errData.parserError),
            );
            pdfParser.on("pdfParser_dataReady", () => {
              const rawText = pdfParser.getRawTextContent();
              resolve(rawText);
            });

            pdfParser.parseBuffer(buffer);
          });
        } else {
          content = await fs.promises.readFile(filePath, "utf8");
        }
      } catch (readErr) {
        console.warn(
          `[Ingest Warn] Failed to read ${fileName}: ${readErr.message}`,
        );
        processedCount++;
        continue;
      }

      if (!content || !content.trim()) {
        processedCount++;
        continue;
      }

      // Resolve sourceId: preserve lineage if an entry exists for this filename
      // (content-changed edit-in-place); otherwise mint a new stable identity.
      const existingEntry = parser.getEntryByFileName(fileName);
      const sourceId = existingEntry
        ? existingEntry.SourceId
        : mintSourceId(job.collection, filePath);

      activeSourceIds.add(sourceId);

      // Remove existing chunks for this sourceId before re-embedding
      if (tables.includes(job.collection)) {
        if (!table) table = await db.openTable(job.collection);
        await table.delete(`SourceId = '${sourceId}'`);
      }

      // Chunk and Embed
      const chunks = chunker.dispatchByExtension(filePath, content);
      for (let i = 0; i < chunks.length; i++) {
        const smartChunk = chunks[i];
        try {
          // Native Fetch to Ollama
          const vector = await ollamaClient.embed(
            smartChunk.text,
            model,
            baseUrl,
          );

          const record = {
            vector: Array.from(vector), // Convert Float32Array to standard array for LanceDB
            FileName: fileName,
            SourceId: sourceId,
            ChunkHash: computeChunkHash(sourceId, i, smartChunk.text),
            ChunkIndex: i,    // kept for migration compatibility
            chunkOrdinal: i,  // authoritative sequencing field (Decision Record §3)
            Text: smartChunk.text,
            HeaderContext: smartChunk.headerContext || "None",
            FileType:
              smartChunk.fileType ||
              path.extname(fileName).replace(".", "") ||
              "text",
            ChunkType: smartChunk.chunkType || "content",
            LocatorType: smartChunk.locatorType || "none",
            StructuralPath:
              smartChunk.structuralPath || smartChunk.headerContext || "None",
            EmbeddingModel: model,
          };

          // Upsert into LanceDB immediately natively
          if (!tables.includes(job.collection) && !table) {
            table = await db.createTable(job.collection, [record]);
            tables.push(job.collection);
          } else {
            if (!table) table = await db.openTable(job.collection);
            await table.add([record]);
          }
        } catch (embedError) {
          console.error(
            `[Ingest Error] Failed to embed chunk ${i} of ${fileName}:`,
            embedError.message,
          );
        }
      }

      // Update Manifest (keyed by sourceId)
      const stats = await fs.promises.stat(filePath);
      parser.addOrUpdate(
        sourceId,
        fileName,
        filePath,
        fileHash,
        chunks.length,
        stats.size,
        model,
      );

      processedCount++;
    }

    // 5. Orphan Cleanup — compare by sourceId, delete by sourceId
    job.progress = "Cleaning up orphans...";
    this._throttledSave();

    const orphanSourceIds = parser.getOrphans(activeSourceIds);
    for (const orphanSourceId of orphanSourceIds) {
      if (tables.includes(job.collection)) {
        if (!table) table = await db.openTable(job.collection);
        await table.delete(`SourceId = '${orphanSourceId}'`);
      }
      parser.remove(orphanSourceId);
    }

    // 6. Save State
    await parser.save();
    job.progress = "Complete";
    this.saveState();
  }

  cancelJob(id) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return false;

    if (job.status === "pending") {
      job.status = "cancelled";
      this.saveState();
      return true;
    }
    // Note: cancelling active promises is not natively supported without AbortControllers
    return false;
  }

  getJobs() {
    return this.jobs;
  }

  _throttledSave() {
    const now = Date.now();
    if (now - this._lastSave < 2000) return;
    this._lastSave = now;
    this.saveState();
  }

  _pruneJobs() {
    const activeStatuses = new Set(["pending", "processing"]);
    const activeJobs = [];
    const terminalJobs = [];

    for (const job of this.jobs) {
      if (activeStatuses.has(job.status)) {
        activeJobs.push(job);
      } else {
        terminalJobs.push(job);
      }
    }

    const sortedTerminal = terminalJobs.sort((a, b) => {
      const aTime = Date.parse(a.completedAt || a.startedAt || a.addedAt || 0);
      const bTime = Date.parse(b.completedAt || b.startedAt || b.addedAt || 0);
      return bTime - aTime;
    });

    const retainedTerminal = sortedTerminal.slice(
      0,
      Math.max(0, this.maxTerminalJobs),
    );
    this.jobs = [...activeJobs, ...retainedTerminal];
  }

  _serializeState() {
    return {
      schemaVersion: QUEUE_STATE_VERSION,
      updatedAt: new Date().toISOString(),
      jobs: this.jobs,
    };
  }

  _jobsSignature() {
    // Use full JSON state to ensure dedup correctness over partial status changes.
    return JSON.stringify(this.jobs);
  }

  async _atomicWriteJson(filePath, payload) {
    const tempPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
    await fs.promises.rename(tempPath, filePath);
  }

  _backupCorruptState() {
    if (!this.persistencePath || !fs.existsSync(this.persistencePath)) {
      return;
    }

    const backupPath = `${this.persistencePath}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(this.persistencePath, backupPath);
      console.warn(`[Queue Load Warning] Backed up corrupt queue state to ${backupPath}`);
    } catch (backupErr) {
      console.warn("[Queue Load Warning] Failed to backup corrupt queue state", backupErr.message);
    }
  }

  _hydrateJobs(raw) {
    if (Array.isArray(raw)) {
      return raw;
    }

    if (raw && typeof raw === "object" && Array.isArray(raw.jobs)) {
      return raw.jobs;
    }

    return [];
  }

  /**
   * Checks the schema version of raw persisted state and applies any
   * registered migrations to bring it up to QUEUE_STATE_VERSION.
   *
   * Returns the (possibly migrated) state object, or null if the stored
   * version is newer than QUEUE_STATE_VERSION (forward-compat failure).
   */
  _migrateQueueState(raw) {
    // Detect stored version: plain array = legacy v0 (pre-versioning)
    let storedVersion;
    if (Array.isArray(raw)) {
      storedVersion = 0;
    } else if (
      raw &&
      typeof raw === "object" &&
      typeof raw.schemaVersion === "number"
    ) {
      storedVersion = raw.schemaVersion;
    } else {
      storedVersion = 0;
    }

    if (storedVersion > QUEUE_STATE_VERSION) {
      return null; // forward-compat failure — caller should backup + reset
    }

    if (storedVersion === QUEUE_STATE_VERSION) {
      return raw; // no migration needed
    }

    // Apply migration chain: storedVersion → QUEUE_STATE_VERSION
    let state = raw;
    for (let v = storedVersion + 1; v <= QUEUE_STATE_VERSION; v++) {
      const fn = QUEUE_MIGRATIONS[v];
      if (fn) {
        console.log(`[Queue] Migrating queue state v${v - 1} → v${v}`);
        state = fn(state);
      }
    }
    return state;
  }

  _schedulePersist() {
    this._pendingPersist = true;

    if (this._persistTimer || this._isPersisting) {
      return;
    }

    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this._runPersistLoop();
    }, Math.max(0, this.persistDebounceMs));
  }

  async _runPersistLoop() {
    if (this._isPersisting || !this.persistencePath) {
      return;
    }

    this._isPersisting = true;
    try {
      while (this._pendingPersist) {
        this._pendingPersist = false;
        this._pruneJobs();
        const payload = this._serializeState();
        await this._atomicWriteJson(this.persistencePath, payload);
        this._metrics.persistenceWrites += 1;
      }
    } catch (err) {
      console.error("[Queue Persistence Error]", err.message);
    } finally {
      this._isPersisting = false;

      // If new updates arrived while we were writing, drain one more cycle.
      if (this._pendingPersist) {
        void this._runPersistLoop();
      }
    }
  }

  async flushPersistence() {
    if (!this.persistencePath) {
      return;
    }

    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }

    this._pendingPersist = true;
    await this._runPersistLoop();
  }

  _emitUpdateNow() {
    const signature = this._jobsSignature();
    if (signature === this._lastEmitSignature) {
      this._metrics.updateEventsDeduped += 1;
      return;
    }

    this._lastEmitSignature = signature;
    this._metrics.updateEventsEmitted += 1;
    this.emit("update", this.jobs);
  }

  _scheduleUpdateEmit() {
    this._pendingEmit = true;

    if (this._emitTimer) {
      return;
    }

    this._emitTimer = setTimeout(() => {
      this._emitTimer = null;
      if (!this._pendingEmit) {
        return;
      }

      this._pendingEmit = false;
      this._emitUpdateNow();

      if (this._pendingEmit) {
        this._scheduleUpdateEmit();
      }
    }, Math.max(0, this.updateEmitDebounceMs));
  }

  flushUpdateEmit() {
    if (this._emitTimer) {
      clearTimeout(this._emitTimer);
      this._emitTimer = null;
    }

    if (!this._pendingEmit) {
      return;
    }

    this._pendingEmit = false;
    this._emitUpdateNow();
  }

  getDebugMetrics() {
    return {
      ...this._metrics,
    };
  }

  resetDebugMetrics() {
    this._metrics = {
      saveRequests: 0,
      persistenceWrites: 0,
      updateEventsEmitted: 0,
      updateEventsDeduped: 0,
    };
  }

  async shutdown() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }

    this._pendingPersist = false;
    this.flushUpdateEmit();
    await this.flushPersistence();
  }

  saveState() {
    if (!this.persistencePath) {
      return;
    }

    this._metrics.saveRequests += 1;
    this._schedulePersist();
    this._scheduleUpdateEmit();
  }

  loadState() {
    try {
      if (this.persistencePath && fs.existsSync(this.persistencePath)) {
        const data = fs.readFileSync(this.persistencePath, "utf8");
        const parsed = JSON.parse(data);

        const migrated = this._migrateQueueState(parsed);
        if (migrated === null) {
          const storedVersion = parsed?.schemaVersion ?? "unknown";
          console.warn(
            `[Queue Load Warning] Queue state has schema version ${storedVersion} which is newer than this code (v${QUEUE_STATE_VERSION}). Resetting to empty state.`,
          );
          this._backupCorruptState();
          this.jobs = [];
          return;
        }
        this.jobs = this._hydrateJobs(migrated);

        this._pruneJobs();
        // Reset any "processing" jobs to "failed" on startup (interrupted)
        this.jobs.forEach((j) => {
          if (j.status === "processing") {
            j.status = "failed";
            j.progress = "Interrupted by server restart";
          }
        });
        console.log(`[Queue] Loaded ${this.jobs.length} jobs from disk.`);
        // Kick off processing if there are pending jobs
        setTimeout(() => this.processNext(), 1000);
      }
    } catch (err) {
      console.warn("[Queue Load Warning]", err.message);
      this._backupCorruptState();
      this.jobs = [];
    }
  }
}

export default IngestionQueue;
