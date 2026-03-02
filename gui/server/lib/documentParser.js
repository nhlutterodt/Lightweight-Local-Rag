import fs from "fs/promises";
import crypto from "crypto";
import path from "path";

class ManifestEntry {
  constructor(
    fileName,
    sourcePath,
    contentHash,
    chunkCount,
    fileSize,
    embeddingModel,
  ) {
    this.FileName = fileName;
    this.SourcePath = sourcePath;
    this.ContentHash = contentHash;
    this.ChunkCount = chunkCount;
    this.FileSize = fileSize;
    this.LastIngested = new Date().toISOString();
    this.EmbeddingModel = embeddingModel;
  }
}

class DocumentParser {
  constructor(collectionPath, collectionName) {
    this.collectionPath = collectionPath;
    this.collectionName = collectionName;
    // Keys are lowercase filenames
    this.entries = new Map();
  }

  // --- Persistence ---

  getManifestPath() {
    return path.join(
      this.collectionPath,
      `${this.collectionName}.manifest.json`,
    );
  }

  async save() {
    const manifestPath = this.getManifestPath();
    const entryList = Array.from(this.entries.values());

    const json = JSON.stringify(
      {
        Version: "1.0",
        Collection: this.collectionName,
        LastUpdated: new Date().toISOString(),
        EntryCount: entryList.length,
        Entries: entryList,
      },
      null,
      2,
    );

    try {
      // Ensure directory exists
      await fs.mkdir(this.collectionPath, { recursive: true });
      await fs.writeFile(manifestPath, json, "utf8");
    } catch (err) {
      console.error(`[Manifest Error] Failed to save manifest: ${err.message}`);
    }
  }

  async load() {
    const manifestPath = this.getManifestPath();
    try {
      const data = await fs.readFile(manifestPath, "utf8");
      const json = JSON.parse(data);

      if (!json || !json.Entries) return;

      this.entries.clear();
      for (const raw of json.Entries) {
        const entry = new ManifestEntry(
          raw.FileName,
          raw.SourcePath,
          raw.ContentHash,
          raw.ChunkCount,
          raw.FileSize,
          raw.EmbeddingModel,
        );
        entry.LastIngested = raw.LastIngested;

        // Use lowercase for case-insensitive lookup
        this.entries.set(entry.FileName.toLowerCase(), entry);
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.warn(`[Manifest Warn] Failed to load manifest: ${err.message}`);
      }
    }
  }

  async clear() {
    this.entries.clear();
    const manifestPath = this.getManifestPath();
    try {
      await fs.unlink(manifestPath);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.warn(
          `[Manifest Warn] Failed to delete manifest: ${err.message}`,
        );
      }
    }
  }

  // --- CRUD ---

  getEntry(fileName) {
    return this.entries.get(fileName.toLowerCase()) || null;
  }

  addOrUpdate(
    fileName,
    sourcePath,
    contentHash,
    chunkCount,
    fileSize,
    embeddingModel,
  ) {
    const entry = new ManifestEntry(
      fileName,
      sourcePath,
      contentHash,
      chunkCount,
      fileSize,
      embeddingModel,
    );
    this.entries.set(fileName.toLowerCase(), entry);
  }

  remove(fileName) {
    this.entries.delete(fileName.toLowerCase());
  }

  // --- Smart Detection ---

  findByHash(contentHash) {
    for (const entry of this.entries.values()) {
      if (entry.ContentHash === contentHash) {
        return entry;
      }
    }
    return null;
  }

  getOrphans(currentFileNames) {
    const currentSet = new Set(currentFileNames.map((f) => f.toLowerCase()));
    const orphans = [];

    for (const [lowerName, entry] of this.entries.entries()) {
      if (!currentSet.has(lowerName)) {
        orphans.push(entry.FileName);
      }
    }
    return orphans;
  }

  // --- Utilities ---

  isUnchanged(fileName, contentHash) {
    const entry = this.getEntry(fileName);
    if (!entry) return false;
    return entry.ContentHash === contentHash;
  }

  count() {
    return this.entries.size;
  }

  // --- File Traversal & Hashing ---

  static async getFileHash(filePath) {
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash("sha256");
    hashSum.update(fileBuffer);
    return hashSum.digest("hex").toUpperCase();
  }

  static async scanDirectory(
    dirPath,
    allowedExtensions = [".md", ".txt", ".ps1", ".xml"],
  ) {
    let results = [];

    async function walk(currentPath) {
      const list = await fs.readdir(currentPath, { withFileTypes: true });

      for (const dirent of list) {
        const res = path.join(currentPath, dirent.name);
        if (dirent.isDirectory()) {
          await walk(res);
        } else {
          const ext = path.extname(res).toLowerCase();
          if (allowedExtensions.includes(ext)) {
            results.push(res);
          }
        }
      }
    }

    await walk(dirPath);
    return results;
  }
}

export { ManifestEntry, DocumentParser };
