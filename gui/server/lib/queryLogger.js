import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import path from "path";

export class QueryLogger {
  constructor(logPath) {
    this.logPath = logPath;
    this.stream = null;
    this.initPromise = this._init();
  }

  async _init() {
    try {
      const dir = path.dirname(this.logPath);
      await mkdir(dir, { recursive: true });
      this.stream = createWriteStream(this.logPath, { flags: "a" });
    } catch (err) {
      console.error("[QueryLogger] Failed to initialize:", err);
    }
  }

  async log(entry) {
    await this.initPromise;
    if (!this.stream) return;

    try {
      // Truncate query if needed
      if (entry.query && entry.query.length > 500) {
        entry.query = entry.query.substring(0, 500) + "...";
      }

      const jsonLine = JSON.stringify(entry) + "\n";
      // Write is non-blocking
      this.stream.write(jsonLine);
    } catch (err) {
      console.error("[QueryLogger]", err);
    }
  }

  async flush() {
    await this.initPromise;
    if (this.stream) {
      return new Promise((resolve) => {
        this.stream.end(resolve);
      });
    }
  }
}
