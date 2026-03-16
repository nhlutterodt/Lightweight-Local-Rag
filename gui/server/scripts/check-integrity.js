/**
 * check-integrity.js
 *
 * CLI runner for the IntegrityCheck module.
 *
 * Usage:
 *   node scripts/check-integrity.js [--repair] [--output <path>]
 *
 * Options:
 *   --repair          Delete orphaned vectors after scan (read-only by default)
 *   --output <path>   Write JSON report to the given file path
 *
 * Exit codes:
 *   0 — no issues found
 *   1 — issues found, or fatal error
 */

import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { VectorStore } from "../lib/vectorStore.js";
import { DocumentParser } from "../lib/documentParser.js";
import { loadConfig } from "../lib/configLoader.js";
import { IntegrityCheck } from "../lib/integrityCheck.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// scripts/ → server/ → gui/ → project root
const serverRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(serverRoot, "..", "..");

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repair = args.get("repair") === true;
  const outputPath = typeof args.get("output") === "string" ? args.get("output") : null;

  const config = loadConfig(projectRoot);

  const dataDir = config?.Paths?.DataDir
    ? config.Paths.DataDir
    : path.join(projectRoot, "PowerShell Scripts", "Data");

  const collectionName = config?.RAG?.CollectionName || "TestIngestNodeFinal";

  const dbDir = path.join(dataDir, "vector_store.lance");

  console.log(`[IntegrityCheck] DB:         ${dbDir}`);
  console.log(`[IntegrityCheck] Collection: ${collectionName}`);
  console.log(`[IntegrityCheck] Repair:     ${repair}`);
  console.log();

  // Load store without model validation so model mismatches are reported as
  // issues rather than causing a hard crash before the scan begins.
  const store = new VectorStore();
  try {
    await store.load(dbDir, collectionName, null);
  } catch (err) {
    console.error(`[IntegrityCheck] Failed to connect to VectorStore: ${err.message}`);
    process.exit(1);
  }

  if (!store.isReady) {
    console.warn(
      "[IntegrityCheck] VectorStore is not ready (table may not exist yet). Nothing to scan.",
    );
    process.exit(0);
  }

  const parser = new DocumentParser(dataDir, collectionName);
  await parser.load();

  const checker = new IntegrityCheck(store, parser);

  let issues, summary;
  try {
    ({ issues, summary } = await checker.scan());
  } catch (err) {
    console.error(`[IntegrityCheck] Scan failed: ${err.message}`);
    process.exit(1);
  }

  // --- Print summary ---
  console.log("[IntegrityCheck] === Scan Complete ===");
  console.log(`  Manifest entries:  ${summary.totalManifestEntries}`);
  console.log(`  Vector DB files:   ${summary.totalVectorFiles}`);
  console.log(`  Vector DB rows:    ${summary.totalVectorRows}`);
  console.log(`  Issues found:      ${summary.issueCount}`);

  if (summary.issueCount > 0) {
    for (const [type, count] of Object.entries(summary.byType)) {
      if (count > 0) {
        console.log(`    ${type}: ${count}`);
      }
    }

    console.log();
    console.log("[IntegrityCheck] Issues:");
    for (const issue of issues) {
      console.warn(`  [${issue.type}] ${issue.fileName}`);
    }
  }

  // --- Optional JSON report ---
  if (outputPath) {
    const report = {
      scannedAt: new Date().toISOString(),
      collection: collectionName,
      dbDir,
      summary,
      issues,
    };
    try {
      await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
      console.log(`\n[IntegrityCheck] Report written to: ${outputPath}`);
    } catch (err) {
      console.error(`[IntegrityCheck] Failed to write report: ${err.message}`);
    }
  }

  // --- Repair (orphans only) ---
  if (repair && issues.length > 0) {
    console.log("\n[IntegrityCheck] Running repair...");
    try {
      const { removed } = await checker.repair(issues);
      console.log(
        `[IntegrityCheck] Repair complete. Removed ${removed} orphaned chunk(s).`,
      );
    } catch (err) {
      console.error(`[IntegrityCheck] Repair failed: ${err.message}`);
      process.exit(1);
    }
  }

  process.exit(summary.issueCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[IntegrityCheck] Fatal error:", err.message);
  process.exit(1);
});
