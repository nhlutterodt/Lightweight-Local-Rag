/**
 * IntegrityCheck
 *
 * Diffs the manifest (DocumentParser) against the LanceDB table (VectorStore)
 * and reports four issue types:
 *
 *   MISSING_VECTORS      — manifest entry exists; LanceDB has 0 rows for that file
 *   CHUNK_COUNT_MISMATCH — row count in LanceDB differs from manifest ChunkCount
 *   MODEL_MISMATCH       — EmbeddingModel stored in rows differs from manifest entry
 *   ORPHANED_VECTORS     — LanceDB rows exist for a file not in the manifest
 *
 * Usage:
 *   const checker = new IntegrityCheck(store, parser);
 *   const { issues, summary } = await checker.scan();
 *   if (repair) await checker.repair(issues);
 */

export class IntegrityCheck {
  /**
   * @param {import('./vectorStore.js').VectorStore} store  Loaded VectorStore instance
   * @param {import('./documentParser.js').DocumentParser} parser  Loaded DocumentParser instance
   */
  constructor(store, parser) {
    this.store = store;
    this.parser = parser;
  }

  /**
   * Scans for divergence between manifest and LanceDB. Read-only.
   * @returns {{ issues: object[], summary: object }}
   */
  async scan() {
    if (!this.store.isReady || !this.store.table) {
      throw new Error(
        "[IntegrityCheck] VectorStore is not ready. Cannot perform scan.",
      );
    }

    const allRows = await this.store.table.query().toArray();

    // Group rows by normalised FileName key
    const vectorsByFile = new Map();
    for (const row of allRows) {
      const key = (row.FileName ?? "").toLowerCase();
      if (!vectorsByFile.has(key)) {
        vectorsByFile.set(key, []);
      }
      vectorsByFile.get(key).push(row);
    }

    const issues = [];

    // --- Check every manifest entry against LanceDB ---
    for (const entry of this.parser.entries.values()) {
      const key = entry.FileName.toLowerCase();
      const rows = vectorsByFile.get(key);

      if (!rows || rows.length === 0) {
        issues.push({
          type: "MISSING_VECTORS",
          fileName: entry.FileName,
          manifestChunkCount: entry.ChunkCount,
        });
        continue;
      }

      if (rows.length !== entry.ChunkCount) {
        issues.push({
          type: "CHUNK_COUNT_MISMATCH",
          fileName: entry.FileName,
          manifestChunkCount: entry.ChunkCount,
          actualChunkCount: rows.length,
        });
      }

      const rowModel = rows[0].EmbeddingModel;
      if (entry.EmbeddingModel && rowModel && rowModel !== entry.EmbeddingModel) {
        issues.push({
          type: "MODEL_MISMATCH",
          fileName: entry.FileName,
          manifestModel: entry.EmbeddingModel,
          rowModel,
        });
      }
    }

    // --- Check for orphaned vectors (in LanceDB but not in manifest) ---
    for (const [key, rows] of vectorsByFile.entries()) {
      if (!this.parser.getEntry(key)) {
        issues.push({
          type: "ORPHANED_VECTORS",
          fileName: rows[0].FileName ?? key,
          orphanedChunkCount: rows.length,
        });
      }
    }

    const byType = {
      MISSING_VECTORS: 0,
      CHUNK_COUNT_MISMATCH: 0,
      MODEL_MISMATCH: 0,
      ORPHANED_VECTORS: 0,
    };
    for (const issue of issues) {
      byType[issue.type] = (byType[issue.type] ?? 0) + 1;
    }

    const summary = {
      totalManifestEntries: this.parser.count(),
      totalVectorFiles: vectorsByFile.size,
      totalVectorRows: allRows.length,
      issueCount: issues.length,
      byType,
    };

    return { issues, summary };
  }

  /**
   * Removes orphaned vectors from LanceDB. Does NOT touch the manifest.
   * MISSING_VECTORS and CHUNK_COUNT_MISMATCH are not repaired here — they
   * require re-ingestion through the normal IngestionQueue pipeline.
   *
   * @param {object[]} issues  Array returned by scan()
   * @returns {{ removed: number }}
   */
  async repair(issues) {
    const orphans = issues.filter((i) => i.type === "ORPHANED_VECTORS");

    if (orphans.length === 0) {
      console.log("[IntegrityCheck] No orphaned vectors to remove.");
      return { removed: 0 };
    }

    const nonOrphanCount =
      issues.length - orphans.length;
    if (nonOrphanCount > 0) {
      console.warn(
        `[IntegrityCheck] ${nonOrphanCount} non-orphan issue(s) (MISSING_VECTORS / CHUNK_COUNT_MISMATCH / MODEL_MISMATCH) require re-ingestion and cannot be auto-repaired.`,
      );
    }

    let removed = 0;
    for (const orphan of orphans) {
      const safeFileName = orphan.fileName.replace(/'/g, "''");
      await this.store.table.delete(`FileName = '${safeFileName}'`);
      console.log(
        `[IntegrityCheck] Removed ${orphan.orphanedChunkCount} orphaned chunk(s) for: ${orphan.fileName}`,
      );
      removed += orphan.orphanedChunkCount;
    }

    return { removed };
  }
}
