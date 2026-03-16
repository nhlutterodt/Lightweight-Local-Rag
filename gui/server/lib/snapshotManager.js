/**
 * snapshotManager.js
 *
 * Provides snapshot (version) management for a LanceDB table.
 *
 * LanceDB creates a new immutable version on every write (add, delete). This
 * class wraps the native version API to allow:
 *   - Listing all available snapshots with timestamps
 *   - Rolling back to a previous version when an ingest or migration produces
 *     bad data
 *   - Pruning old versions to control storage growth on the local device
 *
 * Rollback does NOT automatically repair the manifest. After a rollback, run
 * `check:integrity` (M3) to assess divergence and repair as needed.
 *
 * Usage:
 *   const manager = new SnapshotManager(store);
 *   const { versions, current } = await manager.listVersions();
 *   const result = await manager.rollback(targetVersion);
 *   const pruneResult = await manager.prune(keepLast);
 */

export class SnapshotManager {
  /**
   * @param {import('./vectorStore.js').VectorStore} store  Loaded VectorStore instance
   */
  constructor(store) {
    this.store = store;
  }

  /**
   * Lists all available snapshot versions for the collection.
   * Read-only — does not modify any state.
   *
   * @returns {Promise<{ versions: object[], current: number }>}
   */
  async listVersions() {
    if (!this.store.isReady || !this.store.table) {
      throw new Error(
        "[SnapshotManager] VectorStore is not ready. Cannot list versions.",
      );
    }

    const raw = await this.store.table.listVersions();
    const current = this.store.table.version; // synchronous property

    const versions = raw.map((v) => ({
      ...v,
      isCurrent: v.version === current,
    }));

    console.log(
      `[SnapshotManager] Found ${versions.length} version(s) for collection. Current version: ${current}`,
    );

    return { versions, current };
  }

  /**
   * Rolls back the LanceDB table to a specific version.
   * Uses `checkout(v)` → `restore()` sequence as required by the LanceDB API.
   *
   * The manifest is NOT modified. After rollback, run `check:integrity` to
   * assess divergence between the rolled-back vectors and the manifest.
   *
   * @param {number} targetVersion  Positive integer version to roll back to
   * @returns {Promise<{ rolledBack: boolean, fromVersion: number, toVersion: number }>}
   */
  async rollback(targetVersion) {
    if (!this.store.isReady || !this.store.table) {
      throw new Error(
        "[SnapshotManager] VectorStore is not ready. Cannot perform rollback.",
      );
    }

    if (!Number.isInteger(targetVersion) || targetVersion < 1) {
      throw new Error(
        `[SnapshotManager] Invalid target version: ${targetVersion}. Must be a positive integer.`,
      );
    }

    const { versions, current } = await this.listVersions();

    if (!versions.some((v) => v.version === targetVersion)) {
      const available = versions.map((v) => v.version).join(", ");
      throw new Error(
        `[SnapshotManager] Version ${targetVersion} not found. Available versions: ${available}`,
      );
    }

    // No-op: already at the requested version
    if (targetVersion === current) {
      console.log(
        `[SnapshotManager] Already at version ${targetVersion}. No rollback needed.`,
      );
      return { rolledBack: false, fromVersion: current, toVersion: targetVersion };
    }

    console.log(
      `[SnapshotManager] Rolling back from version ${current} to version ${targetVersion}...`,
    );

    try {
      await this.store.table.checkout(targetVersion);
      await this.store.table.restore();
    } catch (err) {
      throw new Error(
        `[SnapshotManager] Rollback to version ${targetVersion} failed. ` +
          `The version may have been pruned or is unavailable. Details: ${err.message}`,
      );
    }

    console.log(
      `[SnapshotManager] Rollback complete. Collection is now at version ${targetVersion}.`,
    );
    console.log(
      "[SnapshotManager] NOTE: The manifest may be out of sync. Run 'check:integrity' to assess and repair.",
    );

    return { rolledBack: true, fromVersion: current, toVersion: targetVersion };
  }

  /**
   * Removes old LanceDB version data files to reclaim disk space.
   * Keeps the `keepLast` most recent versions (by version number).
   *
   * @param {number} [keepLast=5]  Number of most-recent versions to retain
   * @returns {Promise<{ pruned: number, kept: number }>}
   */
  async prune(keepLast = 5) {
    if (!this.store.isReady || !this.store.table) {
      throw new Error(
        "[SnapshotManager] VectorStore is not ready. Cannot prune.",
      );
    }

    if (!Number.isInteger(keepLast) || keepLast < 1) {
      throw new Error(
        `[SnapshotManager] keepLast must be a positive integer. Got: ${keepLast}`,
      );
    }

    const { versions } = await this.listVersions();

    if (versions.length <= keepLast) {
      console.log(
        `[SnapshotManager] ${versions.length} version(s) found; keepLast=${keepLast}. Nothing to prune.`,
      );
      return { pruned: 0, kept: versions.length };
    }

    // Sort oldest-first (listVersions already returns oldest-first, but sort
    // defensively to ensure cutoff calculation is correct).
    const sorted = [...versions].sort((a, b) => a.version - b.version);

    // The oldest version to KEEP is at index (total - keepLast).
    // cleanupOldVersions(timestamp) removes versions with timestamp < cutoff,
    // so setting cutoff = sorted[cutoffIdx].timestamp preserves that version
    // and removes everything strictly older.
    const cutoffIdx = sorted.length - keepLast;
    const cutoff = sorted[cutoffIdx].timestamp;

    await this.store.table.cleanupOldVersions(cutoff);

    const prunedCount = versions.length - keepLast;
    console.log(
      `[SnapshotManager] Pruned ${prunedCount} old version(s). Kept ${keepLast} most recent version(s).`,
    );

    return { pruned: prunedCount, kept: keepLast };
  }
}
