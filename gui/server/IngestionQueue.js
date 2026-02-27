import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PowerShellRunner from "./PowerShellRunner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class IngestionQueue {
  constructor(psRunner, dataDir = path.join(__dirname, "data")) {
    this.psRunner = psRunner;
    this.persistencePath = path.join(dataDir, "queue.json");
    this.jobs = [];
    this.isWorking = false;
    this._lastSave = 0;
    this.currentJob = null;

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

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
      await this.executeIngest(job);
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

  executeIngest(job) {
    return new Promise((resolve, reject) => {
      const ps = this.psRunner.spawn("Ingest-Documents.ps1", [
        "-SourcePath",
        job.path,
        "-CollectionName",
        job.collection,
        "-Signal",
      ]);

      PowerShellRunner.parseJsonStream(
        ps,
        (obj) => {
          if (obj.type === "status") {
            job.progress = obj.message;
            this._throttledSave();
          }
        },
        (raw) => {
          // Track raw output if needed
        },
      );

      ps.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Process exited with code ${code}`));
      });

      ps.on("error", (err) => reject(err));
    });
  }

  cancelJob(id) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return false;

    if (job.status === "pending") {
      job.status = "cancelled";
      this.saveState();
      return true;
    }
    // Note: To cancel active jobs, we'd need to track the process handle
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

  saveState() {
    try {
      fs.writeFileSync(
        this.persistencePath,
        JSON.stringify(this.jobs, null, 2),
      );
    } catch (err) {
      console.error("[Queue Persistence Error]", err.message);
    }
  }

  loadState() {
    try {
      if (fs.existsSync(this.persistencePath)) {
        const data = fs.readFileSync(this.persistencePath, "utf8");
        this.jobs = JSON.parse(data);
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
      this.jobs = [];
    }
  }
}

export default IngestionQueue;
