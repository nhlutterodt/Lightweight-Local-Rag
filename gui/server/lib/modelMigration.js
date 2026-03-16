/**
 * modelMigration.js
 *
 * Handles automatic re-embedding when the configured EmbeddingModel changes.
 *
 * When the stored model in LanceDB differs from the target model in config,
 * this module:
 *   1. Collects unique source directories from the current manifest entries.
 *   2. Clears the manifest so every file is treated as new by the ingest pipeline.
 *   3. Enqueues one re-index job per unique source directory.
 *
 * The VectorStore is left with isReady = false by the caller (server.js) until
 * re-indexing completes and the server restarts with the new model fully indexed.
 */

import path from "path";

/**
 * Triggers a full re-embedding migration for a collection.
 *
 * @param {import('./documentParser.js').DocumentParser} parser  Loaded DocumentParser instance
 * @param {{ enqueue: (dir: string, collection: string) => object }} queue  IngestionQueue instance
 * @param {string} collectionName  Name of the LanceDB collection
 * @param {string} storedModel    Model string found in LanceDB rows
 * @param {string} targetModel    Model string from current config
 * @returns {Promise<{ queued: number, sourceDirs: string[] }>}
 */
export async function triggerModelMigration(
  parser,
  queue,
  collectionName,
  storedModel,
  targetModel,
) {
  console.warn(
    `[ModelMigration] Embedding model mismatch detected. ` +
      `stored="${storedModel}" → configured="${targetModel}". ` +
      `Initiating full re-embedding migration for collection "${collectionName}".`,
  );

  // Collect unique source directories from manifest entries
  const sourceDirs = new Set();
  for (const entry of parser.entries.values()) {
    if (
      entry.SourcePath &&
      typeof entry.SourcePath === "string" &&
      entry.SourcePath.trim() !== ""
    ) {
      sourceDirs.add(path.dirname(entry.SourcePath));
    }
  }

  if (sourceDirs.size === 0) {
    console.warn(
      `[ModelMigration] No valid SourcePath entries in manifest for "${collectionName}". ` +
        `Re-ingest source directories manually to complete the migration.`,
    );
    return { queued: 0, sourceDirs: [] };
  }

  // Clear manifest BEFORE enqueuing — prevents a fast worker from reading
  // stale manifest entries before the clear completes.
  await parser.clear();
  console.log(`[ModelMigration] Manifest cleared for "${collectionName}".`);

  const dirList = [...sourceDirs];
  for (const dir of dirList) {
    queue.enqueue(dir, collectionName);
    console.log(`[ModelMigration] Queued re-index: ${dir}`);
  }

  console.log(
    `[ModelMigration] ${dirList.length} job(s) queued. ` +
      `Vector search unavailable until re-indexing completes and server restarts.`,
  );
  return { queued: dirList.length, sourceDirs: dirList };
}
