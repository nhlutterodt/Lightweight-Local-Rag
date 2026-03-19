import { createWriteStream } from "fs";
import { mkdir, rename, stat } from "fs/promises";
import path from "path";

export class QueryLogger {
  constructor(logPath, options = {}) {
    this.logPath = logPath;
    this.options = {
      rotateLegacyOnInit: options.rotateLegacyOnInit !== false,
      archiveDirName: options.archiveDirName || "archive",
      clock: typeof options.clock === "function" ? options.clock : () => new Date(),
    };
    this.stream = null;
    this.initPromise = this._init();
  }

  static formatArchiveTimestamp(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return (
      `${date.getUTCFullYear()}` +
      `${pad(date.getUTCMonth() + 1)}` +
      `${pad(date.getUTCDate())}-` +
      `${pad(date.getUTCHours())}` +
      `${pad(date.getUTCMinutes())}` +
      `${pad(date.getUTCSeconds())}`
    );
  }

  static getLegacyLogPath(activeLogPath) {
    const dir = path.dirname(activeLogPath);
    const activeBaseName = path.basename(activeLogPath);
    const legacyBaseName = activeBaseName.replace(/\.v\d+\.jsonl$/i, ".jsonl");
    if (legacyBaseName === activeBaseName) {
      return null;
    }
    return path.join(dir, legacyBaseName);
  }

  async rotateLegacyLogIfNeeded() {
    if (!this.options.rotateLegacyOnInit) {
      return;
    }

    const legacyPath = QueryLogger.getLegacyLogPath(this.logPath);
    if (!legacyPath || legacyPath === this.logPath) {
      return;
    }

    let legacyStats;
    try {
      legacyStats = await stat(legacyPath);
    } catch (err) {
      if (err?.code === "ENOENT") {
        return;
      }
      throw err;
    }

    if (!legacyStats.isFile()) {
      return;
    }

    const activeDir = path.dirname(this.logPath);
    const archiveDir = path.join(activeDir, this.options.archiveDirName);
    await mkdir(archiveDir, { recursive: true });

    const baseName = path.basename(legacyPath, ".jsonl");
    const timestamp = QueryLogger.formatArchiveTimestamp(this.options.clock());
    const archivePath = path.join(
      archiveDir,
      `${baseName}.legacy.${timestamp}.jsonl`,
    );

    await rename(legacyPath, archivePath);
  }

  async _init() {
    try {
      const dir = path.dirname(this.logPath);
      await mkdir(dir, { recursive: true });
      await this.rotateLegacyLogIfNeeded();
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
