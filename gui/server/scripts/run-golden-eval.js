import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";
import { loadConfig } from "../lib/configLoader.js";
import { VectorStore } from "../lib/vectorStore.js";
import { embed } from "../lib/ollamaClient.js";
import {
  enforceQueryLogSchema,
  resolveQueryLogPath,
  SCORE_SCHEMA_VERSION,
  SCORE_TYPE,
} from "../lib/evalLogSchema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(serverRoot, "..", "..");

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
    i += 1;
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeIsoFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function normalizeText(text) {
  if (!text) return "";
  return String(text).toLowerCase();
}

function getTopMatchRank(results, expectedNames, expectedHeaderHints) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const loweredNames = (expectedNames || []).map(normalizeText);
  const loweredHints = (expectedHeaderHints || []).map(normalizeText);

  for (let i = 0; i < results.length; i++) {
    const fileName = normalizeText(results[i].FileName || "");
    const header = normalizeText(results[i].HeaderContext || "");

    const nameHit = loweredNames.some((value) => fileName.includes(value));
    const headerHit = loweredHints.some((value) => header.includes(value));

    if (nameHit || headerHit) {
      return i + 1;
    }
  }

  return null;
}

function summarizeRun(entries) {
  const total = entries.length;
  const passedRecall = entries.filter((x) => x.hasExpectedHit).length;
  const avgLatencyMs =
    total > 0
      ? entries.reduce((sum, x) => sum + x.latencyMs, 0) / total
      : 0;
  const avgTopScore =
    total > 0
      ? entries.reduce((sum, x) => sum + (x.topScore || 0), 0) / total
      : 0;
  const mrr =
    total > 0
      ? entries.reduce((sum, x) => sum + (x.topMatchRank ? 1 / x.topMatchRank : 0), 0) /
        total
      : 0;

  return {
    queryCount: total,
    recallAtK: total > 0 ? passedRecall / total : 0,
    meanReciprocalRank: mrr,
    avgLatencyMs,
    avgTopScore,
  };
}

function compareRuns(currentRun, baselineRun) {
  const baselineById = new Map();
  for (const item of baselineRun.entries || []) {
    baselineById.set(item.id, item);
  }

  const perQuery = [];
  for (const item of currentRun.entries || []) {
    const base = baselineById.get(item.id);
    perQuery.push({
      id: item.id,
      baselineTopFiles: base ? base.topFiles : [],
      currentTopFiles: item.topFiles,
      baselineTopScore: base ? base.topScore : null,
      currentTopScore: item.topScore,
      baselineTopMatchRank: base ? base.topMatchRank : null,
      currentTopMatchRank: item.topMatchRank,
      latencyDeltaMs:
        base && Number.isFinite(base.latencyMs)
          ? item.latencyMs - base.latencyMs
          : null,
    });
  }

  return {
    baselineSummary: baselineRun.summary,
    currentSummary: currentRun.summary,
    deltas: {
      recallAtK:
        currentRun.summary.recallAtK - (baselineRun.summary?.recallAtK || 0),
      meanReciprocalRank:
        currentRun.summary.meanReciprocalRank -
        (baselineRun.summary?.meanReciprocalRank || 0),
      avgLatencyMs:
        currentRun.summary.avgLatencyMs - (baselineRun.summary?.avgLatencyMs || 0),
      avgTopScore:
        currentRun.summary.avgTopScore - (baselineRun.summary?.avgTopScore || 0),
    },
    perQuery,
  };
}

async function runEvaluation(options) {
  const config = loadConfig(workspaceRoot);
  const goldenPath = options.goldenPath;
  const baselinePath = options.baselinePath;

  const goldenQueries = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  const dataDir = config?.Paths?.DataDir
    ? config.Paths.DataDir
    : path.join(workspaceRoot, "PowerShell Scripts", "Data");
  const dbDir = path.join(dataDir, "vector_store.lance");

  const defaultCollection = options.collection || config?.RAG?.CollectionName || "TestIngestNodeFinal";
  const embeddingModel = config?.RAG?.EmbeddingModel || "nomic-embed-text";
  const ollamaUrl = config?.RAG?.OllamaUrl || "http://localhost:11434";

  const store = new VectorStore();
  const entries = [];

  for (const item of goldenQueries) {
    const collection = item.collection || defaultCollection;
    const topK = Number(item.topK || config?.RAG?.TopK || 5);
    const minScore =
      options.minScoreOverride !== null
        ? options.minScoreOverride
        : Number(item.minScore || config?.RAG?.MinScore || 0.5);

    try {
      const t0 = performance.now();
      await store.load(dbDir, collection, embeddingModel);
      const queryVector = await embed(item.query, embeddingModel, ollamaUrl);
      const results = await store.findNearest(queryVector, topK, minScore);
      const latencyMs = performance.now() - t0;

      const topMatchRank = getTopMatchRank(
        results,
        item.expectedAnyFileNames,
        item.expectedAnyHeaderContains,
      );

      entries.push({
        id: item.id,
        query: item.query,
        collection,
        topK,
        minScore,
        latencyMs,
        topScore: results.length > 0 ? results[0].score : 0,
        topFiles: results.map((r) => r.FileName),
        topHeaders: results.map((r) => r.HeaderContext),
        topMatchRank,
        hasExpectedHit: topMatchRank !== null,
        resultCount: results.length,
      });
    } catch (err) {
      entries.push({
        id: item.id,
        query: item.query,
        collection,
        topK,
        minScore,
        latencyMs: 0,
        topScore: 0,
        topFiles: [],
        topHeaders: [],
        topMatchRank: null,
        hasExpectedHit: false,
        resultCount: 0,
        error: err.message,
      });
    }
  }

  const run = {
    createdAt: new Date().toISOString(),
    mode: options.mode,
    scoreSchemaVersion: SCORE_SCHEMA_VERSION,
    scoreType: SCORE_TYPE,
    embeddingModel,
    collection: defaultCollection,
    summary: summarizeRun(entries),
    entries,
  };

  const reportDir = path.join(workspaceRoot, "TestResults", "retrieval-eval");
  ensureDir(reportDir);

  if (options.mode === "baseline") {
    fs.writeFileSync(baselinePath, JSON.stringify(run, null, 2));
    const baselineSummaryPath = path.join(
      reportDir,
      `golden-baseline-summary-${safeIsoFile()}.md`,
    );
    const lines = [
      "# Golden Retrieval Baseline",
      "",
      `- Created: ${run.createdAt}`,
      `- Embedding Model: ${run.embeddingModel}`,
      `- Collection: ${run.collection}`,
      `- Query Count: ${run.summary.queryCount}`,
      `- Recall@K: ${run.summary.recallAtK.toFixed(4)}`,
      `- MRR: ${run.summary.meanReciprocalRank.toFixed(4)}`,
      `- Avg Latency (ms): ${run.summary.avgLatencyMs.toFixed(2)}`,
      `- Avg Top Score: ${run.summary.avgTopScore.toFixed(4)}`,
      "",
      "## Queries",
      "",
    ];

    for (const e of run.entries) {
      lines.push(`- ${e.id}: hit=${e.hasExpectedHit}, topRank=${e.topMatchRank ?? "none"}, latencyMs=${e.latencyMs.toFixed(2)}`);
    }

    fs.writeFileSync(baselineSummaryPath, lines.join("\n") + "\n");
    return {
      run,
      baselinePath,
      reportPath: baselineSummaryPath,
      comparison: null,
    };
  }

  if (!fs.existsSync(baselinePath)) {
    throw new Error(
      `Baseline file not found at ${baselinePath}. Run with --mode baseline first.`,
    );
  }

  const baselineRun = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  if (
    !options.allowLegacySchema &&
    baselineRun.scoreSchemaVersion !== SCORE_SCHEMA_VERSION
  ) {
    throw new Error(
      `Baseline scoreSchemaVersion mismatch. Expected ${SCORE_SCHEMA_VERSION}, found ${baselineRun.scoreSchemaVersion || "<missing>"}. Regenerate baseline.`,
    );
  }
  if (!options.allowLegacySchema && baselineRun.scoreType !== SCORE_TYPE) {
    throw new Error(
      `Baseline scoreType mismatch. Expected ${SCORE_TYPE}, found ${baselineRun.scoreType || "<missing>"}. Regenerate baseline.`,
    );
  }

  const comparison = compareRuns(run, baselineRun);
  const reportPath = path.join(
    reportDir,
    `golden-compare-report-${safeIsoFile()}.md`,
  );

  const reportLines = [
    "# Golden Retrieval Comparison Report",
    "",
    `- Compared At: ${run.createdAt}`,
    `- Baseline Created At: ${baselineRun.createdAt}`,
    "",
    "## Summary",
    "",
    `- Recall@K: ${baselineRun.summary.recallAtK.toFixed(4)} -> ${run.summary.recallAtK.toFixed(4)} (delta ${(comparison.deltas.recallAtK >= 0 ? "+" : "") + comparison.deltas.recallAtK.toFixed(4)})`,
    `- MRR: ${baselineRun.summary.meanReciprocalRank.toFixed(4)} -> ${run.summary.meanReciprocalRank.toFixed(4)} (delta ${(comparison.deltas.meanReciprocalRank >= 0 ? "+" : "") + comparison.deltas.meanReciprocalRank.toFixed(4)})`,
    `- Avg Latency (ms): ${baselineRun.summary.avgLatencyMs.toFixed(2)} -> ${run.summary.avgLatencyMs.toFixed(2)} (delta ${(comparison.deltas.avgLatencyMs >= 0 ? "+" : "") + comparison.deltas.avgLatencyMs.toFixed(2)})`,
    `- Avg Top Score: ${baselineRun.summary.avgTopScore.toFixed(4)} -> ${run.summary.avgTopScore.toFixed(4)} (delta ${(comparison.deltas.avgTopScore >= 0 ? "+" : "") + comparison.deltas.avgTopScore.toFixed(4)})`,
    "",
    "## Query Deltas",
    "",
  ];

  for (const delta of comparison.perQuery) {
    reportLines.push(`- ${delta.id}: rank ${delta.baselineTopMatchRank ?? "none"} -> ${delta.currentTopMatchRank ?? "none"}, latencyDeltaMs=${delta.latencyDeltaMs === null ? "n/a" : delta.latencyDeltaMs.toFixed(2)}`);
  }

  fs.writeFileSync(reportPath, reportLines.join("\n") + "\n");

  const compareJsonPath = path.join(
    reportDir,
    `golden-compare-report-${safeIsoFile()}.json`,
  );
  fs.writeFileSync(compareJsonPath, JSON.stringify({ run, comparison }, null, 2));

  return {
    run,
    baselinePath,
    reportPath,
    comparison,
    compareJsonPath,
  };
}

function usage() {
  console.log(
    "Usage: node scripts/run-golden-eval.js --mode baseline|compare [--golden tests/data/golden_queries.json] [--baseline TestResults/retrieval-eval/golden_baseline.json] [--collection NAME] [--min-score NUMBER] [--query-log path] [--allow-legacy-schema]",
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.get("help")) {
    usage();
    return;
  }

  const mode = String(args.get("mode") || "compare").toLowerCase();
  if (!new Set(["baseline", "compare"]).has(mode)) {
    usage();
    process.exitCode = 1;
    return;
  }

  const goldenPath = path.resolve(
    serverRoot,
    String(args.get("golden") || "tests/data/golden_queries.json"),
  );

  const baselinePath = path.resolve(
    workspaceRoot,
    String(
      args.get("baseline") || "TestResults/retrieval-eval/golden_baseline.json",
    ),
  );

  const collection = args.get("collection")
    ? String(args.get("collection"))
    : null;
  const minScoreOverride = args.get("min-score")
    ? Number(args.get("min-score"))
    : null;
  const allowLegacySchema = Boolean(args.get("allow-legacy-schema"));
  const explicitQueryLogPath = args.get("query-log")
    ? path.resolve(String(args.get("query-log")))
    : null;

  if (minScoreOverride !== null && !Number.isFinite(minScoreOverride)) {
    throw new Error("--min-score must be a valid number");
  }

  const queryLogSelection = resolveQueryLogPath({
    workspaceRoot,
    explicitQueryLogPath,
    allowLegacySchema,
  });
  const schemaCheck = enforceQueryLogSchema({
    queryLogPath: queryLogSelection.queryLogPath,
    allowLegacySchema,
  });
  if (schemaCheck.checked) {
    console.log(
      `[Eval] Query log schema validated at ${queryLogSelection.queryLogPath} (${schemaCheck.rowCount} rows).`,
    );
  } else {
    console.log(
      `[Eval] Query log not found at ${queryLogSelection.queryLogPath}; skipping query-log schema check.`,
    );
  }

  const result = await runEvaluation({
    mode,
    goldenPath,
    baselinePath,
    collection,
    minScoreOverride,
    allowLegacySchema,
  });

  console.log(`Mode: ${mode}`);
  console.log(`Golden queries: ${goldenPath}`);
  console.log(`Baseline path: ${baselinePath}`);
  console.log(`Report: ${result.reportPath}`);

  if (mode === "compare") {
    console.log(`Comparison JSON: ${result.compareJsonPath}`);
  }

  console.log("Summary:");
  console.log(JSON.stringify(result.run.summary, null, 2));
}

main().catch((err) => {
  console.error("Golden evaluation failed:", err.message);
  process.exitCode = 1;
});