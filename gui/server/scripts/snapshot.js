/**
 * snapshot.js
 *
 * CLI runner for the SnapshotManager module.
 *
 * Usage:
 *   node scripts/snapshot.js --list [--output <path>]
 *   node scripts/snapshot.js --rollback --to <version> [--output <path>]
 *   node scripts/snapshot.js --prune [--keep-last <N>] [--output <path>]
 *
 * Options:
 *   --list                List all available snapshot versions
 *   --rollback            Roll back to a specific version (requires --to)
 *   --to <version>        Target version number for rollback
 *   --prune               Remove old versions to reclaim disk space
 *   --keep-last <N>       Number of most-recent versions to retain (default: 5)
 *   --output <path>       Write JSON report to the given file path
 *
 * Exit codes:
 *   0 — operation succeeded (including no-op rollback/prune)
 *   1 — error, bad arguments, or active ingest jobs detected
 */

import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { VectorStore } from "../lib/vectorStore.js";
import { loadConfig } from "../lib/configLoader.js";
import { SnapshotManager } from "../lib/snapshotManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// scripts/ → server/ → gui/ → project root
const serverRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(serverRoot, "..", "..");

// ---------------------------------------------------------------------------
// Argument parsing — verbatim from check-integrity.js
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, true);
      continue;
    }
    args.set(key, next);
    i++;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Integer validation — correctly rejects "3.5" which parseInt truncates to 3
// ---------------------------------------------------------------------------

function parsePositiveInt(raw) {
  if (
    typeof raw !== "string" ||
    !Number.isInteger(Number(raw)) ||
    Number(raw) < 1
  ) {
    return null;
  }
  return Number(raw);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const doList = args.get("list") === true;
  const doRollback = args.get("rollback") === true;
  const doPrune = args.get("prune") === true;
  const toValue = args.get("to");
  const keepLastValue = args.get("keep-last");
  const outputPath =
    typeof args.get("output") === "string" ? args.get("output") : null;

  // --- Mode validation ---
  if (!doList && !doRollback && !doPrune) {
    console.error(
      "Usage:\n" +
        "  node scripts/snapshot.js --list [--output <path>]\n" +
        "  node scripts/snapshot.js --rollback --to <version> [--output <path>]\n" +
        "  node scripts/snapshot.js --prune [--keep-last <N>] [--output <path>]",
    );
    process.exit(1);
  }

  if (doRollback && !toValue) {
    console.error("[Snapshot] Error: --rollback requires --to <version>.");
    process.exit(1);
  }

  let targetVersion = null;
  if (doRollback) {
    targetVersion = parsePositiveInt(String(toValue));
    if (targetVersion === null) {
      console.error(
        `[Snapshot] Error: --to value must be a positive integer. Got: "${toValue}"`,
      );
      process.exit(1);
    }
  }

  let keepLast = 5;
  if (doPrune && keepLastValue !== undefined && keepLastValue !== true) {
    const parsed = parsePositiveInt(String(keepLastValue));
    if (parsed === null) {
      console.error(
        `[Snapshot] Error: --keep-last value must be a positive integer. Got: "${keepLastValue}"`,
      );
      process.exit(1);
    }
    keepLast = parsed;
  }

  // --- Resolve paths ---
  const config = loadConfig(projectRoot);
  const dataDir = config?.Paths?.DataDir
    ? config.Paths.DataDir
    : path.join(projectRoot, "PowerShell Scripts", "Data");

  const collectionName = config?.RAG?.CollectionName || "TestIngestNodeFinal";
  const dbDir = path.join(dataDir, "vector_store.lance");

  // --- Startup banner ---
  const modeLabel = doList
    ? "list"
    : doRollback
      ? `rollback to ${targetVersion}`
      : `prune (keep-last=${keepLast})`;

  console.log(`[Snapshot] DB:         ${dbDir}`);
  console.log(`[Snapshot] Collection: ${collectionName}`);
  console.log(`[Snapshot] Mode:       ${modeLabel}`);
  console.log();

  // --- Concurrent ingest guard (write operations only) ---
  if (doRollback || doPrune) {
    const queuePath = path.join(dataDir, "queue.json");
    try {
      const raw = await fs.readFile(queuePath, "utf8");
      const queueData = JSON.parse(raw);
      const jobs = Array.isArray(queueData)
        ? queueData
        : (queueData.jobs ?? []);
      const activeJobs = jobs.filter((j) => j.status === "processing");
      if (activeJobs.length > 0) {
        console.warn(
          `[Snapshot] Warning: ${activeJobs.length} active ingest job(s) detected.`,
        );
        console.warn(
          `[Snapshot] A rollback or prune during active ingestion may cause data inconsistency.`,
        );
        console.warn(
          `[Snapshot] Wait for all jobs to complete or stop the server before proceeding.`,
        );
        process.exit(1);
      }
    } catch {
      // queue.json may not exist on first run — not an error, continue
    }
  }

  // --- Connect to VectorStore ---
  const store = new VectorStore();
  try {
    await store.load(dbDir, collectionName, null);
  } catch (err) {
    console.error(`[Snapshot] Failed to connect to VectorStore: ${err.message}`);
    process.exit(1);
  }

  if (!store.isReady) {
    console.warn(
      "[Snapshot] VectorStore is not ready (table may not exist yet). Nothing to do.",
    );
    process.exit(0);
  }

  const manager = new SnapshotManager(store);

  // -------------------------------------------------------------------------
  // --list
  // -------------------------------------------------------------------------
  if (doList) {
    let result;
    try {
      result = await manager.listVersions();
    } catch (err) {
      console.error(`[Snapshot] Error listing versions: ${err.message}`);
      process.exit(1);
    }

    const { versions, current } = result;

    if (versions.length === 0) {
      console.log("[Snapshot] No versions found.");
    } else {
      console.log(
        `[Snapshot] === Version History (${versions.length} version(s)) ===`,
      );
      for (const v of versions) {
        const ts =
          v.timestamp instanceof Date
            ? v.timestamp.toISOString()
            : String(v.timestamp);
        const marker = v.isCurrent ? "  <-- current" : "";
        console.log(`  v${v.version}  ${ts}${marker}`);
      }
    }

    if (outputPath) {
      const report = {
        reportType: "snapshot-list",
        generatedAt: new Date().toISOString(),
        collection: collectionName,
        dbDir,
        current,
        versions: versions.map((v) => ({
          version: v.version,
          timestamp:
            v.timestamp instanceof Date
              ? v.timestamp.toISOString()
              : String(v.timestamp),
          isCurrent: v.isCurrent,
        })),
      };
      try {
        await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
        console.log(`\n[Snapshot] Report written to: ${outputPath}`);
      } catch (err) {
        console.error(`[Snapshot] Failed to write report: ${err.message}`);
      }
    }

    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // --rollback --to <version>
  // -------------------------------------------------------------------------
  if (doRollback) {
    console.log(`[Snapshot] Requesting rollback to version ${targetVersion}...`);

    let result;
    try {
      result = await manager.rollback(targetVersion);
    } catch (err) {
      console.error(`[Snapshot] Rollback failed: ${err.message}`);
      process.exit(1);
    }

    if (result.rolledBack) {
      console.log(
        `[Snapshot] Rollback succeeded: v${result.fromVersion} → v${result.toVersion}`,
      );
      console.log(
        "[Snapshot] IMPORTANT: Manifest may be out of sync. Run 'npm run check:integrity' to assess state.",
      );
    } else {
      console.log(
        `[Snapshot] Already at version ${targetVersion}. No rollback performed.`,
      );
    }

    if (outputPath) {
      const report = {
        reportType: "snapshot-rollback",
        generatedAt: new Date().toISOString(),
        collection: collectionName,
        dbDir,
        rolledBack: result.rolledBack,
        fromVersion: result.fromVersion,
        toVersion: result.toVersion,
      };
      try {
        await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
        console.log(`\n[Snapshot] Report written to: ${outputPath}`);
      } catch (err) {
        console.error(`[Snapshot] Failed to write report: ${err.message}`);
      }
    }

    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // --prune [--keep-last N]
  // -------------------------------------------------------------------------
  if (doPrune) {
    console.log(
      `[Snapshot] === Pruning old versions (keep-last=${keepLast}) ===`,
    );

    let result;
    try {
      result = await manager.prune(keepLast);
    } catch (err) {
      console.error(`[Snapshot] Prune failed: ${err.message}`);
      process.exit(1);
    }

    if (result.pruned === 0) {
      console.log(
        `[Snapshot] Nothing to prune (${result.kept} version(s) found, keep-last=${keepLast}).`,
      );
    } else {
      console.log(
        `[Snapshot] Pruned ${result.pruned} old version(s). Kept ${result.kept} version(s).`,
      );
    }

    if (outputPath) {
      const report = {
        reportType: "snapshot-prune",
        generatedAt: new Date().toISOString(),
        collection: collectionName,
        dbDir,
        keepLast,
        pruned: result.pruned,
        kept: result.kept,
      };
      try {
        await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
        console.log(`\n[Snapshot] Report written to: ${outputPath}`);
      } catch (err) {
        console.error(`[Snapshot] Failed to write report: ${err.message}`);
      }
    }

    process.exit(0);
  }
}

main().catch((err) => {
  console.error("[Snapshot] Fatal error:", err.message);
  process.exit(1);
});
