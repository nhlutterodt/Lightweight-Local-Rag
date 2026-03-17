import fs from "fs/promises";
import crypto from "crypto";
import path from "path";
import { mintSourceId } from "./sourceIdentity.js";

/**
 * Ordered list of all known manifest versions, oldest first.
 * Add new versions here when the manifest schema changes.
 */
const MANIFEST_KNOWN_VERSIONS = ["1.0", "2.0"];
const MANIFEST_VERSION = MANIFEST_KNOWN_VERSIONS.at(-1); // "2.0"

/**
 * Migration functions keyed by TARGET version string.
 * Each function receives the full manifest JSON at (previous version)
 * and returns the JSON at (target version).
 */
const MANIFEST_MIGRATIONS = {
  // v1.0 → v2.0: entries gain a SourceId field.
  // We mint using (collection, SourcePath) as the seed, which matches the
  // approved persisted-lineage minting rule.  Entries without a SourcePath
  // fall back to (collection, FileName).
  "2.0": (json) => {
    const collection = json.Collection || "";
    return {
      ...json,
      Version: "2.0",
      Entries: json.Entries.map((e) => ({
        ...e,
        SourceId:
          e.SourceId ||
          mintSourceId(collection, e.SourcePath || e.FileName),
      })),
    };
  },
};

class ManifestEntry {
  constructor(
    sourceId,
    fileName,
    sourcePath,
    contentHash,
    chunkCount,
    fileSize,
    embeddingModel,
  ) {
    this.SourceId = sourceId;
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
    // Keys are sourceIds (primary identity per the decision record)
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
        Version: MANIFEST_VERSION,
        Collection: this.collectionName,
        LastUpdated: new Date().toISOString(),
        EntryCount: entryList.length,
        Entries: entryList,
      },
      null,
      2,
    );

    try {
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

      // --- Schema version check and migration ---
      const loadedVersion = json.Version || "1.0"; // missing = legacy = "1.0"
      if (!MANIFEST_KNOWN_VERSIONS.includes(loadedVersion)) {
        console.warn(
          `[Manifest Warn] Unsupported manifest version "${loadedVersion}". ` +
            `Known: [${MANIFEST_KNOWN_VERSIONS.join(", ")}]. Entries will not be loaded.`,
        );
        return;
      }

      // Apply any pending migrations
      const startIdx = MANIFEST_KNOWN_VERSIONS.indexOf(loadedVersion);
      const endIdx = MANIFEST_KNOWN_VERSIONS.indexOf(MANIFEST_VERSION);
      let workingJson = json;
      // Inject collection name in case the manifest lacks it (legacy)
      if (!workingJson.Collection) workingJson = { ...workingJson, Collection: this.collectionName };
      for (let i = startIdx + 1; i <= endIdx; i++) {
        const targetVersion = MANIFEST_KNOWN_VERSIONS[i];
        const fn = MANIFEST_MIGRATIONS[targetVersion];
        if (fn) {
          console.log(
            `[Manifest] Migrating manifest from ${MANIFEST_KNOWN_VERSIONS[i - 1]} → ${targetVersion}`,
          );
          workingJson = fn(workingJson);
        }
      }
      // --- End migration ---

      this.entries.clear();
      for (const raw of workingJson.Entries) {
        const entry = new ManifestEntry(
          raw.SourceId,
          raw.FileName,
          raw.SourcePath,
          raw.ContentHash,
          raw.ChunkCount,
          raw.FileSize,
          raw.EmbeddingModel,
        );
        entry.LastIngested = raw.LastIngested;

        // Key by sourceId (primary identity)
        this.entries.set(entry.SourceId, entry);
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

  /**
   * Primary lookup by sourceId.
   * @param {string} sourceId
   * @returns {ManifestEntry|null}
   */
  getEntry(sourceId) {
    return this.entries.get(sourceId) ?? null;
  }

  /**
   * Auxiliary lookup by FileName (case-insensitive).
   * Not the primary key — use only when sourceId is not yet known.
   * @param {string} fileName
   * @returns {ManifestEntry|null}
   */
  getEntryByFileName(fileName) {
    const lower = fileName.toLowerCase();
    for (const entry of this.entries.values()) {
      if (entry.FileName.toLowerCase() === lower) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Create or replace a manifest entry. Key is sourceId.
   * @param {string} sourceId
   * @param {string} fileName
   * @param {string} sourcePath
   * @param {string} contentHash
   * @param {number} chunkCount
   * @param {number} fileSize
   * @param {string} embeddingModel
   */
  addOrUpdate(
    sourceId,
    fileName,
    sourcePath,
    contentHash,
    chunkCount,
    fileSize,
    embeddingModel,
  ) {
    const entry = new ManifestEntry(
      sourceId,
      fileName,
      sourcePath,
      contentHash,
      chunkCount,
      fileSize,
      embeddingModel,
    );
    this.entries.set(sourceId, entry);
  }

  /**
   * Mutates an existing entry in-place (e.g. on rename).
   * Only updates the fields supplied in `updates`; sourceId and other fields
   * are preserved.
   * @param {string} sourceId
   * @param {{ FileName?: string, SourcePath?: string, ContentHash?: string, ChunkCount?: number }} updates
   */
  updateEntry(sourceId, updates) {
    const entry = this.entries.get(sourceId);
    if (!entry) return;
    if (updates.FileName !== undefined) entry.FileName = updates.FileName;
    if (updates.SourcePath !== undefined) entry.SourcePath = updates.SourcePath;
    if (updates.ContentHash !== undefined) entry.ContentHash = updates.ContentHash;
    if (updates.ChunkCount !== undefined) entry.ChunkCount = updates.ChunkCount;
  }

  /**
   * Remove an entry by sourceId.
   * @param {string} sourceId
   */
  remove(sourceId) {
    this.entries.delete(sourceId);
  }

  // --- Smart Detection ---

  /**
   * Find the entry whose ContentHash matches. Used for rename detection.
   * @param {string} contentHash
   * @returns {ManifestEntry|null}
   */
  findByHash(contentHash) {
    for (const entry of this.entries.values()) {
      if (entry.ContentHash === contentHash) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Returns the sourceIds of manifest entries that are not in `activeSourceIds`.
   * @param {Set<string>} activeSourceIds - Set of sourceIds still present on disk
   * @returns {string[]} orphan sourceIds
   */
  getOrphans(activeSourceIds) {
    const orphans = [];
    for (const sourceId of this.entries.keys()) {
      if (!activeSourceIds.has(sourceId)) {
        orphans.push(sourceId);
      }
    }
    return orphans;
  }

  // --- Utilities ---

  /**
   * Returns true if the named file has not changed since last ingest.
   * Uses auxiliary filename lookup — prefer findByHash for full disambiguation.
   * @param {string} fileName
   * @param {string} contentHash
   * @returns {boolean}
   */
  isUnchanged(fileName, contentHash) {
    const entry = this.getEntryByFileName(fileName);
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
    allowedExtensions = [".md", ".txt", ".ps1", ".xml", ".pdf"],
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
