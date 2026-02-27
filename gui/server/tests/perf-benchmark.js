/**
 * Practical Performance Benchmark — Local RAG Pipeline
 *
 * Standalone script (no test framework needed).
 * Measures the four critical performance surfaces:
 *   1. VectorStore binary load from disk
 *   2. findNearest cosine-similarity scan throughput
 *   3. Ollama embed round-trip latency
 *   4. Config spawnSync cold-start cost
 *
 * Usage:  node tests/perf-benchmark.js
 * Output: Console table + Logs/perf-baseline.json
 */

import { VectorStore } from "../lib/vectorStore.js";
import { embed } from "../lib/ollamaClient.js";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync, existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, "..", "..", "..");
const DATA_DIR = path.join(ROOT, "PowerShell Scripts", "Data");
const LOGS_DIR = path.join(ROOT, "Logs");
const COLLECTION = "ProjectDocs";

// ── Helpers ──────────────────────────────────────────────────

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(timingsUs) {
  const sorted = [...timingsUs].sort((a, b) => a - b);
  return {
    min: sorted[0],
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
    count: sorted.length,
  };
}

function hrToUs(hr) {
  return hr[0] * 1e6 + hr[1] / 1e3;
}

function hrToMs(hr) {
  return hr[0] * 1e3 + hr[1] / 1e6;
}

function fmt(us) {
  if (us < 1000) return `${us.toFixed(1)} μs`;
  if (us < 1e6) return `${(us / 1000).toFixed(2)} ms`;
  return `${(us / 1e6).toFixed(2)} s`;
}

function fmtMs(ms) {
  return `${ms.toFixed(1)} ms`;
}

// ── Benchmark 1: VectorStore Load ────────────────────────────

async function benchVectorStoreLoad() {
  console.log("\n─── Benchmark 1: VectorStore Load ───");

  const binPath = path.join(DATA_DIR, `${COLLECTION}.vectors.bin`);
  const metaPath = path.join(DATA_DIR, `${COLLECTION}.metadata.json`);

  const timings = [];

  // 3 warm-up loads, then 10 timed loads
  for (let i = 0; i < 13; i++) {
    const store = new VectorStore();
    const start = process.hrtime();
    await store.load(binPath, metaPath);
    const elapsed = process.hrtime(start);
    const ms = hrToMs(elapsed);

    if (i >= 3) {
      timings.push(ms);
    }

    // Report details on first successful load
    if (i === 0) {
      const memEstimate =
        store.count * store.dims * 4 + JSON.stringify(store.metadata).length;
      console.log(`  Vectors: ${store.count}`);
      console.log(`  Dimensions: ${store.dims}`);
      console.log(`  Model: ${store.model || "legacy"}`);
      console.log(
        `  Memory estimate: ${(memEstimate / 1024).toFixed(1)} KB (vectors + metadata)`,
      );
    }
  }

  const sorted = [...timings].sort((a, b) => a - b);
  const result = {
    label: "VectorStore Load",
    min: fmtMs(sorted[0]),
    median: fmtMs(percentile(sorted, 50)),
    p95: fmtMs(percentile(sorted, 95)),
    max: fmtMs(sorted[sorted.length - 1]),
    iterations: timings.length,
    rawMs: sorted,
  };

  console.log(
    `  Load time: min=${result.min}  median=${result.median}  p95=${result.p95}  max=${result.max}`,
  );
  return result;
}

// ── Benchmark 2: findNearest Hot-Path ────────────────────────

async function benchFindNearest() {
  console.log("\n─── Benchmark 2: findNearest Hot-Path ───");

  const store = new VectorStore();
  const binPath = path.join(DATA_DIR, `${COLLECTION}.vectors.bin`);
  const metaPath = path.join(DATA_DIR, `${COLLECTION}.metadata.json`);
  await store.load(binPath, metaPath);

  // Synthetic query vector (random floats normalized)
  const queryVec = new Float32Array(store.dims);
  for (let i = 0; i < store.dims; i++) {
    queryVec[i] = Math.random() * 2 - 1;
  }
  // Normalize
  let mag = 0;
  for (let i = 0; i < store.dims; i++) mag += queryVec[i] * queryVec[i];
  mag = Math.sqrt(mag);
  for (let i = 0; i < store.dims; i++) queryVec[i] /= mag;

  const topK = 5;
  const minScore = 0.0; // Use 0 to force full scan every time

  // Warm-up: 100 iterations
  for (let i = 0; i < 100; i++) {
    store.findNearest(queryVec, topK, minScore);
  }

  // Timed: 1000 iterations
  const timingsUs = [];
  for (let i = 0; i < 1000; i++) {
    const start = process.hrtime();
    store.findNearest(queryVec, topK, minScore);
    const elapsed = process.hrtime(start);
    timingsUs.push(hrToUs(elapsed));
  }

  const s = stats(timingsUs);
  const qps = (1e6 / s.median).toFixed(0);

  const result = {
    label: "findNearest (brute-force cosine)",
    vectorCount: store.count,
    dimensions: store.dims,
    min: fmt(s.min),
    median: fmt(s.median),
    p95: fmt(s.p95),
    max: fmt(s.max),
    throughput: `${qps} queries/sec`,
    iterations: s.count,
    rawUs: timingsUs,
  };

  console.log(`  Against ${store.count} vectors × ${store.dims} dims`);
  console.log(
    `  Latency: min=${result.min}  median=${result.median}  p95=${result.p95}  max=${result.max}`,
  );
  console.log(`  Throughput: ~${qps} queries/sec`);
  return result;
}

// ── Benchmark 3: Ollama Embed Round-Trip ─────────────────────

async function benchEmbedRoundTrip() {
  console.log("\n─── Benchmark 3: Ollama Embed Round-Trip ───");

  const ollamaUrl = "http://localhost:11434";
  const model = "nomic-embed-text";
  const testQuery = "What is the architecture of this project?";

  // Connectivity check
  try {
    await embed("test", model, ollamaUrl);
  } catch (err) {
    console.log(`  ⚠ Ollama not reachable at ${ollamaUrl}: ${err.message}`);
    console.log("  Skipping embed benchmark.");
    return {
      label: "Ollama Embed Round-Trip",
      status: "skipped",
      reason: err.message,
    };
  }

  // Warm-up: 10 calls
  for (let i = 0; i < 10; i++) {
    await embed(testQuery, model, ollamaUrl);
  }

  // Timed: 20 calls
  const timingsMs = [];
  for (let i = 0; i < 20; i++) {
    const start = process.hrtime();
    const vec = await embed(testQuery, model, ollamaUrl);
    const elapsed = process.hrtime(start);
    timingsMs.push(hrToMs(elapsed));

    if (i === 0) {
      console.log(`  Returned vector dims: ${vec.length}`);
    }
  }

  const sorted = [...timingsMs].sort((a, b) => a - b);
  const result = {
    label: "Ollama Embed Round-Trip",
    model,
    min: fmtMs(sorted[0]),
    median: fmtMs(percentile(sorted, 50)),
    p95: fmtMs(percentile(sorted, 95)),
    max: fmtMs(sorted[sorted.length - 1]),
    iterations: timingsMs.length,
    rawMs: sorted,
  };

  console.log(
    `  Latency: min=${result.min}  median=${result.median}  p95=${result.p95}  max=${result.max}`,
  );
  return result;
}

// ── Benchmark 4: Config spawnSync Cold-Start ─────────────────

function benchConfigLoad() {
  console.log("\n─── Benchmark 4: Config spawnSync Cold-Start ───");

  const scriptPath = path.join(
    ROOT,
    "PowerShell Scripts",
    "Get-ProjectConfig.ps1",
  );

  const timingsMs = [];

  // 5 iterations (each is genuinely cold since spawnSync creates a new process)
  for (let i = 0; i < 5; i++) {
    const start = process.hrtime();
    const result = spawnSync(
      "pwsh",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { encoding: "utf8" },
    );
    const elapsed = process.hrtime(start);
    timingsMs.push(hrToMs(elapsed));

    if (i === 0) {
      console.log(
        `  Config loaded: ${result.status === 0 ? "OK" : "FAIL (code " + result.status + ")"}`,
      );
    }
  }

  const sorted = [...timingsMs].sort((a, b) => a - b);
  const result = {
    label: "Config spawnSync Cold-Start",
    min: fmtMs(sorted[0]),
    median: fmtMs(percentile(sorted, 50)),
    max: fmtMs(sorted[sorted.length - 1]),
    iterations: timingsMs.length,
    rawMs: sorted,
  };

  console.log(
    `  Latency: min=${result.min}  median=${result.median}  max=${result.max}`,
  );
  return result;
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   Local RAG Pipeline — Performance Baseline  ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log(`  Data: ${DATA_DIR}`);
  console.log(`  Collection: ${COLLECTION}`);

  const results = {};

  try {
    results.vectorStoreLoad = await benchVectorStoreLoad();
  } catch (err) {
    console.error(`  ✗ VectorStore load failed: ${err.message}`);
    results.vectorStoreLoad = { label: "VectorStore Load", error: err.message };
  }

  try {
    results.findNearest = await benchFindNearest();
  } catch (err) {
    console.error(`  ✗ findNearest benchmark failed: ${err.message}`);
    results.findNearest = {
      label: "findNearest",
      error: err.message,
    };
  }

  try {
    results.embedRoundTrip = await benchEmbedRoundTrip();
  } catch (err) {
    console.error(`  ✗ Embed benchmark failed: ${err.message}`);
    results.embedRoundTrip = {
      label: "Ollama Embed Round-Trip",
      error: err.message,
    };
  }

  try {
    results.configLoad = benchConfigLoad();
  } catch (err) {
    console.error(`  ✗ Config load benchmark failed: ${err.message}`);
    results.configLoad = {
      label: "Config spawnSync Cold-Start",
      error: err.message,
    };
  }

  // ── Summary Table ──
  console.log("\n══════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("══════════════════════════════════════════════");

  const tableRows = [];
  for (const [, v] of Object.entries(results)) {
    if (v.error) {
      tableRows.push({ Benchmark: v.label, Status: `ERROR: ${v.error}` });
    } else if (v.status === "skipped") {
      tableRows.push({ Benchmark: v.label, Status: `SKIPPED: ${v.reason}` });
    } else {
      tableRows.push({
        Benchmark: v.label,
        Min: v.min,
        Median: v.median,
        P95: v.p95 || "—",
        Max: v.max,
        Iterations: v.iterations,
        Throughput: v.throughput || "—",
      });
    }
  }
  console.table(tableRows);

  // ── Persist Results ──
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }

  // Strip raw timing arrays for the persisted file (keep it readable)
  const persistable = {};
  for (const [k, v] of Object.entries(results)) {
    const { rawUs, rawMs, ...clean } = v;
    persistable[k] = clean;
  }
  persistable.meta = {
    timestamp: new Date().toISOString(),
    collection: COLLECTION,
    dataDir: DATA_DIR,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };

  const outPath = path.join(LOGS_DIR, "perf-baseline.json");
  writeFileSync(outPath, JSON.stringify(persistable, null, 2));
  console.log(`\n✓ Results saved to ${outPath}`);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
