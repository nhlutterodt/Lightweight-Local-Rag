/**
 * snapshotManager.test.js
 *
 * Unit tests for SnapshotManager (listVersions, rollback, prune).
 *
 * Mock pattern: plain objects with jest.fn() overrides — same as
 * integrityCheck.test.js and modelMigration.test.js.
 * No real filesystem or LanceDB operations.
 */

import { jest } from "@jest/globals";
import { SnapshotManager } from "../lib/snapshotManager.js";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const TS1 = new Date("2026-03-10T12:00:00.000Z");
const TS2 = new Date("2026-03-11T08:30:00.000Z");
const TS3 = new Date("2026-03-12T14:22:00.000Z");

/**
 * Creates a minimal mock LanceDB table with the full snapshot API surface.
 * @param {object} [overrides]  Override any default property
 */
function makeTable(overrides = {}) {
  return {
    version: 3,
    listVersions: jest.fn().mockResolvedValue([
      { version: 1, timestamp: TS1 },
      { version: 2, timestamp: TS2 },
      { version: 3, timestamp: TS3 },
    ]),
    checkout: jest.fn().mockResolvedValue(undefined),
    restore: jest.fn().mockResolvedValue(undefined),
    checkoutLatest: jest.fn().mockResolvedValue(undefined),
    cleanupOldVersions: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Returns a ready-looking store wrapper around the given table. */
function makeStore(table) {
  return { isReady: true, table };
}

// ---------------------------------------------------------------------------
// listVersions()
// ---------------------------------------------------------------------------

describe("SnapshotManager", () => {
  describe("listVersions()", () => {
    // 1 — Store not ready
    test("throws when store is not ready", async () => {
      const store = { isReady: false, table: null };
      await expect(
        new SnapshotManager(store).listVersions(),
      ).rejects.toThrow(/not ready/i);
    });

    // 2 — isCurrent flags
    test("returns all versions with the correct isCurrent flag", async () => {
      const table = makeTable(); // version: 3, versions [v1, v2, v3]
      const store = makeStore(table);

      const { versions, current } = await new SnapshotManager(store).listVersions();

      expect(current).toBe(3);
      expect(versions).toHaveLength(3);
      expect(versions[0]).toMatchObject({ version: 1, isCurrent: false });
      expect(versions[1]).toMatchObject({ version: 2, isCurrent: false });
      expect(versions[2]).toMatchObject({ version: 3, isCurrent: true });
    });

    // 3 — Timestamps preserved
    test("preserves timestamps from the listVersions response", async () => {
      const table = makeTable({
        version: 1,
        listVersions: jest.fn().mockResolvedValue([{ version: 1, timestamp: TS1 }]),
      });
      const store = makeStore(table);

      const { versions } = await new SnapshotManager(store).listVersions();

      expect(versions[0].timestamp).toBe(TS1);
    });

    // 4 — Empty versions array
    test("returns empty versions array when listVersions returns empty", async () => {
      const table = makeTable({
        version: 0,
        listVersions: jest.fn().mockResolvedValue([]),
      });
      const store = makeStore(table);

      const { versions, current } = await new SnapshotManager(store).listVersions();

      expect(versions).toHaveLength(0);
      expect(current).toBe(0);
    });

    // 5 — Exactly one isCurrent: true
    test("marks exactly one version as isCurrent: true", async () => {
      const table = makeTable(); // v3 is current
      const store = makeStore(table);

      const { versions } = await new SnapshotManager(store).listVersions();

      const currentEntries = versions.filter((v) => v.isCurrent === true);
      expect(currentEntries).toHaveLength(1);
      expect(currentEntries[0].version).toBe(3);
    });

    // 6 — Calls table.listVersions exactly once
    test("calls table.listVersions exactly once", async () => {
      const table = makeTable();
      const store = makeStore(table);

      await new SnapshotManager(store).listVersions();

      expect(table.listVersions).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // rollback()
  // ---------------------------------------------------------------------------

  describe("rollback()", () => {
    // 7 — Store not ready
    test("throws when store is not ready", async () => {
      const store = { isReady: false, table: null };
      await expect(
        new SnapshotManager(store).rollback(1),
      ).rejects.toThrow(/not ready/i);
    });

    // 8 — Float input rejected
    test("throws for a float targetVersion (1.5)", async () => {
      const store = makeStore(makeTable());
      await expect(
        new SnapshotManager(store).rollback(1.5),
      ).rejects.toThrow(/invalid target version/i);
    });

    // 9 — Zero rejected
    test("throws for a targetVersion of zero", async () => {
      const store = makeStore(makeTable());
      await expect(
        new SnapshotManager(store).rollback(0),
      ).rejects.toThrow(/invalid target version/i);
    });

    // 10 — Negative rejected
    test("throws for a negative targetVersion", async () => {
      const store = makeStore(makeTable());
      await expect(
        new SnapshotManager(store).rollback(-1),
      ).rejects.toThrow(/invalid target version/i);
    });

    // 11 — Version not in history
    test("throws when target version does not exist in version history", async () => {
      const store = makeStore(makeTable()); // versions are [1, 2, 3]
      await expect(
        new SnapshotManager(store).rollback(99),
      ).rejects.toThrow(/version 99 not found/i);
    });

    // 12 — No-op when already at target
    test("returns rolledBack: false when already at the target version", async () => {
      const table = makeTable(); // current version = 3
      const store = makeStore(table);

      const result = await new SnapshotManager(store).rollback(3);

      expect(result).toEqual({ rolledBack: false, fromVersion: 3, toVersion: 3 });
      expect(table.checkout).not.toHaveBeenCalled();
      expect(table.restore).not.toHaveBeenCalled();
    });

    // 13 — checkout called before restore (call-order spy)
    test("calls checkout then restore in the correct sequential order", async () => {
      const callOrder = [];
      const table = makeTable({
        checkout: jest.fn().mockImplementation(async () => {
          callOrder.push("checkout");
        }),
        restore: jest.fn().mockImplementation(async () => {
          callOrder.push("restore");
        }),
      });
      const store = makeStore(table);

      await new SnapshotManager(store).rollback(1);

      expect(callOrder).toEqual(["checkout", "restore"]);
    });

    // 14 — checkout called with correct version number
    test("calls checkout with the correct target version number", async () => {
      const table = makeTable();
      const store = makeStore(table);

      await new SnapshotManager(store).rollback(2);

      expect(table.checkout).toHaveBeenCalledWith(2);
    });

    // 15 — Returns correct fromVersion / toVersion
    test("returns correct fromVersion and toVersion after a successful rollback", async () => {
      const table = makeTable(); // current = 3, versions = [1, 2, 3]
      const store = makeStore(table);

      const result = await new SnapshotManager(store).rollback(1);

      expect(result).toEqual({ rolledBack: true, fromVersion: 3, toVersion: 1 });
    });

    // 16 — checkoutLatest not called
    test("does not call checkoutLatest during a normal rollback", async () => {
      const table = makeTable();
      const store = makeStore(table);

      await new SnapshotManager(store).rollback(1);

      expect(table.checkoutLatest).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // prune()
  // ---------------------------------------------------------------------------

  describe("prune()", () => {
    // 17 — Store not ready
    test("throws when store is not ready", async () => {
      const store = { isReady: false, table: null };
      await expect(
        new SnapshotManager(store).prune(5),
      ).rejects.toThrow(/not ready/i);
    });

    // 18 — keepLast = 0 rejected
    test("throws for keepLast = 0", async () => {
      const store = makeStore(makeTable());
      await expect(
        new SnapshotManager(store).prune(0),
      ).rejects.toThrow(/keepLast must be a positive integer/i);
    });

    // 19 — Nothing to prune when versions.length <= keepLast
    test("returns pruned: 0 and does not call cleanupOldVersions when nothing to prune", async () => {
      const table = makeTable(); // 3 versions, keepLast=5
      const store = makeStore(table);

      const result = await new SnapshotManager(store).prune(5);

      expect(result).toEqual({ pruned: 0, kept: 3 });
      expect(table.cleanupOldVersions).not.toHaveBeenCalled();
    });

    // 20 — cleanupOldVersions called exactly once
    test("calls cleanupOldVersions exactly once when versions exceed keepLast", async () => {
      const table = makeTable(); // 3 versions, keepLast=2
      const store = makeStore(table);

      await new SnapshotManager(store).prune(2);

      expect(table.cleanupOldVersions).toHaveBeenCalledTimes(1);
    });

    // 21 — cleanupOldVersions called with correct cutoff date
    test("calls cleanupOldVersions with the oldest-to-keep version timestamp as cutoff", async () => {
      // 3 versions [v1@TS1, v2@TS2, v3@TS3], keepLast=2 → keep v2, v3 → prune v1
      // cutoffIdx = 3 - 2 = 1 → sorted[1] = v2 → cutoff = TS2
      const table = makeTable(); // default: [v1@TS1, v2@TS2, v3@TS3], current=3
      const store = makeStore(table);

      await new SnapshotManager(store).prune(2);

      expect(table.cleanupOldVersions).toHaveBeenCalledWith(TS2);
    });

    // 22 — Returns correct pruned / kept counts
    test("returns correct pruned and kept counts after pruning", async () => {
      const table = makeTable(); // 3 versions, keepLast=2 → prune 1, keep 2
      const store = makeStore(table);

      const result = await new SnapshotManager(store).prune(2);

      expect(result).toEqual({ pruned: 1, kept: 2 });
    });
  });
});
