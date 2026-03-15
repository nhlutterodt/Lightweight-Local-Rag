import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";
import * as lancedb from "@lancedb/lancedb";
import * as ollamaClient from "./lib/ollamaClient.js";

import { SmartTextChunker } from "./lib/smartChunker.js";
import { DocumentParser } from "./lib/documentParser.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import PDFParser from "pdf2json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QUEUE_STATE_VERSION = 1;
const DEFAULT_MAX_TERMINAL_JOBS = 200;

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

    const currentFileNames = files.map((f) => path.basename(f));

    job.progress = `Processing 0 / ${files.length} files`;
    this._throttledSave();

    // 4. Processing Loop
    let processedCount = 0;
    for (const filePath of files) {
      const fileName = path.basename(filePath);
      job.progress = `Processing ${fileName} (${processedCount + 1}/${files.length})`;
      this._throttledSave();

      const fileHash = await DocumentParser.getFileHash(filePath);

      // Check Manifest (Skip Unchanged)
      if (parser.isUnchanged(fileName, fileHash)) {
        processedCount++;
        continue;
      }

      // Check Manifest (Rename Detection)
      const hashMatch = parser.findByHash(fileHash);
      if (hashMatch && hashMatch.FileName !== fileName) {
        if (tables.includes(job.collection)) {
          if (!table) table = await db.openTable(job.collection);
          // Update metadata in LanceDB to point to the new filename
          const safeOldFileName = hashMatch.FileName.replace(/'/g, "''");
          await table.update({
            where: `FileName = '${safeOldFileName}'`,
            values: { FileName: fileName },
          });
        }

        parser.remove(hashMatch.FileName);
        parser.addOrUpdate(
          fileName,
          filePath,
          fileHash,
          hashMatch.ChunkCount,
          hashMatch.FileSize,
          model,
        );
        processedCount++;
        continue;
      }

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
            pdfParser.on("pdfParser_dataReady", (pdfData) => {
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

      // Remove existing vectors for this file before re-embedding
      if (tables.includes(job.collection)) {
        if (!table) table = await db.openTable(job.collection);
        const safeFileName = fileName.replace(/'/g, "''");
        await table.delete(`FileName = '${safeFileName}'`);
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
            ChunkIndex: i,
            Text: smartChunk.text,
            HeaderContext: smartChunk.headerContext || "None",
            FileType:
              smartChunk.fileType ||
              path.extname(fileName).replace(".", "") ||
              "text",
            ChunkType: smartChunk.chunkType || "content",
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

      // Update Manifest
      const stats = await fs.promises.stat(filePath);
      parser.addOrUpdate(
        fileName,
        filePath,
        fileHash,
        chunks.length,
        stats.size,
        model,
      );

      processedCount++;
    }

    // 5. Orphan Cleanup
    job.progress = "Cleaning up orphans...";
    this._throttledSave();

    const orphans = parser.getOrphans(currentFileNames);
    for (const orphan of orphans) {
      if (tables.includes(job.collection)) {
        if (!table) table = await db.openTable(job.collection);
        const safeOrphan = orphan.replace(/'/g, "''");
        await table.delete(`FileName = '${safeOrphan}'`);
      }
      parser.remove(orphan);
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

  _atomicWriteJson(filePath, payload) {
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
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

  saveState() {
    try {
      if (!this.persistencePath) {
        return;
      }

      this._pruneJobs();
      const payload = this._serializeState();
      this._atomicWriteJson(this.persistencePath, payload);
      this.emit("update", this.jobs);
    } catch (err) {
      console.error("[Queue Persistence Error]", err.message);
    }
  }

  loadState() {
    try {
      if (this.persistencePath && fs.existsSync(this.persistencePath)) {
        const data = fs.readFileSync(this.persistencePath, "utf8");
        const parsed = JSON.parse(data);
        this.jobs = this._hydrateJobs(parsed);

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
