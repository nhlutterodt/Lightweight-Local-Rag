import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";
import { loadConfig } from "../lib/configLoader.js";
import { VectorStore } from "../lib/vectorStore.js";
import { embed } from "../lib/ollamaClient.js";
import { buildRetrievalPlan, RETRIEVAL_MODES } from "../lib/retrievalModes.js";
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
  return String(text || "").toLowerCase();
}

function getTopMatchRank(results, expectedNames, expectedHeaders) {
  const names = (expectedNames || []).map(normalizeText);
  const headers = (expectedHeaders || []).map(normalizeText);

  for (let index = 0; index < (results || []).length; index++) {
    const fileName = normalizeText(results[index].FileName);
    const header = normalizeText(results[index].HeaderContext);
    const nameHit = names.some((value) => fileName.includes(value));
    const headerHit = headers.some((value) => header.includes(value));

    if (nameHit || headerHit) {
      return index + 1;
    }
  }

  return null;
}

function summarize(entries) {
  const total = entries.length;
  if (total === 0) {
    return {
      queryCount: 0,
      recallAtK: 0,
      meanReciprocalRank: 0,
      avgLatencyMs: 0,
      avgTopScore: 0,
    };
  }

  const recallHits = entries.filter((entry) => entry.hasExpectedHit).length;
  const mrr =
    entries.reduce(
      (sum, entry) => sum + (entry.topMatchRank ? 1 / entry.topMatchRank : 0),
      0,
    ) / total;

  return {
    queryCount: total,
    recallAtK: recallHits / total,
    meanReciprocalRank: mrr,
    avgLatencyMs:
      entries.reduce((sum, entry) => sum + entry.latencyMs, 0) / total,
    avgTopScore: entries.reduce((sum, entry) => sum + entry.topScore, 0) / total,
  };
}

async function runModeEvaluation({ mode, queries, config, store, dbDir }) {
  const embeddingModel = config?.RAG?.EmbeddingModel || "nomic-embed-text";
  const ollamaUrl = config?.RAG?.OllamaUrl || "http://localhost:11434";
  const entries = [];

  for (const query of queries) {
    const collection = query.collection || config?.RAG?.CollectionName || "TestIngestNodeFinal";
    const topK = Number(query.topK || config?.RAG?.TopK || 5);
    const minScore = Number(query.minScore || config?.RAG?.MinScore || 0.003);

    const retrievalPlan = buildRetrievalPlan({
      mode,
      query: query.query,
      constraints: query.retrievalConstraints || null,
      overfetchFactor: config?.RAG?.FilteredVectorOverfetch || 4,
      hybridOverfetch: config?.RAG?.HybridOverfetch || 6,
      hybridLexicalWeight: config?.RAG?.HybridLexicalWeight || 0.35,
    });

    try {
      const t0 = performance.now();
      await store.load(dbDir, collection, embeddingModel);
      const queryVector = await embed(query.query, embeddingModel, ollamaUrl);
      const results = await store.findNearest(
        queryVector,
        topK,
        minScore,
        retrievalPlan.vectorOptions,
      );
      const latencyMs = performance.now() - t0;
      for (const item of results) {
        const score = item?.score;
        if (!Number.isFinite(score) || score < 0 || score > 1) {
          throw new Error(
            `Score contract violation for query ${query.id} in mode ${mode}: expected normalized score in [0,1], got ${score}`,
          );
        }
      }

      const topMatchRank = getTopMatchRank(
        results,
        query.expectedAnyFileNames,
        query.expectedAnyHeaderContains,
      );

      entries.push({
        id: query.id,
        query: query.query,
        mode,
        overfetchFactor: retrievalPlan.appliedOverfetchFactor || 1,
        constraintsActive: retrievalPlan.constraintsActive,
        latencyMs,
        topScore: results[0]?.score || 0,
        topFiles: results.map((item) => item.FileName),
        topHeaders: results.map((item) => item.HeaderContext),
        resultCount: results.length,
        topMatchRank,
        hasExpectedHit: topMatchRank !== null,
      });
    } catch (error) {
      entries.push({
        id: query.id,
        query: query.query,
        mode,
        overfetchFactor: retrievalPlan.appliedOverfetchFactor || 1,
        constraintsActive: retrievalPlan.constraintsActive,
        latencyMs: 0,
        topScore: 0,
        topFiles: [],
        topHeaders: [],
        resultCount: 0,
        topMatchRank: null,
        hasExpectedHit: false,
        error: error.message,
      });
    }
  }

  return {
    mode,
    summary: summarize(entries),
    entries,
  };
}

function buildDeltas(baseSummary, otherSummary) {
  return {
    recallAtK: otherSummary.recallAtK - baseSummary.recallAtK,
    meanReciprocalRank:
      otherSummary.meanReciprocalRank - baseSummary.meanReciprocalRank,
    avgLatencyMs: otherSummary.avgLatencyMs - baseSummary.avgLatencyMs,
    avgTopScore: otherSummary.avgTopScore - baseSummary.avgTopScore,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const allowLegacySchema = Boolean(args.get("allow-legacy-schema"));
  const explicitQueryLogPath = args.get("query-log")
    ? path.resolve(String(args.get("query-log")))
    : null;

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

  const queriesPath = path.resolve(
    serverRoot,
    String(args.get("queries") || "tests/data/targeted_retrieval_queries.json"),
  );

  const config = loadConfig(workspaceRoot);
  const queries = JSON.parse(fs.readFileSync(queriesPath, "utf8"));

  const dataDir = config?.Paths?.DataDir
    ? config.Paths.DataDir
    : path.join(workspaceRoot, "PowerShell Scripts", "Data");
  const dbDir = path.join(dataDir, "vector_store.lance");

  const modes = [
    RETRIEVAL_MODES.VECTOR,
    RETRIEVAL_MODES.FILTERED_VECTOR,
    RETRIEVAL_MODES.HYBRID,
  ];

  const store = new VectorStore();
  const runs = [];
  for (const mode of modes) {
    const run = await runModeEvaluation({ mode, queries, config, store, dbDir });
    runs.push(run);
  }

  const runByMode = Object.fromEntries(runs.map((run) => [run.mode, run]));
  const vectorSummary = runByMode.vector.summary;
  const filteredSummary = runByMode["filtered-vector"].summary;
  const hybridSummary = runByMode.hybrid.summary;

  const reportDir = path.join(workspaceRoot, "TestResults", "retrieval-eval");
  ensureDir(reportDir);
  const stamp = safeIsoFile();
  const markdownPath = path.join(reportDir, `retrieval-mode-compare-${stamp}.md`);
  const jsonPath = path.join(reportDir, `retrieval-mode-compare-${stamp}.json`);

  const filteredVsVector = buildDeltas(vectorSummary, filteredSummary);
  const hybridVsFiltered = buildDeltas(filteredSummary, hybridSummary);

  const rows = runs
    .map((run) => {
      const summary = run.summary;
      return `| ${run.mode} | ${summary.recallAtK.toFixed(4)} | ${summary.meanReciprocalRank.toFixed(4)} | ${summary.avgLatencyMs.toFixed(2)} | ${summary.avgTopScore.toFixed(6)} |`;
    })
    .join("\n");

  const markdown = [
    "# Retrieval Mode Comparative Evaluation",
    "",
    `- Created: ${new Date().toISOString()}`,
    `- Query set: ${path.relative(workspaceRoot, queriesPath)}`,
    `- Query count: ${queries.length}`,
    "",
    "## Mode Summary",
    "",
    "| Mode | Recall@K | MRR | Avg Latency (ms) | Avg Top Score |",
    "| --- | ---: | ---: | ---: | ---: |",
    rows,
    "",
    "## Key Deltas",
    "",
    `- Filtered-vector vs vector: Recall delta ${(filteredVsVector.recallAtK >= 0 ? "+" : "") + filteredVsVector.recallAtK.toFixed(4)}, MRR delta ${(filteredVsVector.meanReciprocalRank >= 0 ? "+" : "") + filteredVsVector.meanReciprocalRank.toFixed(4)}, latency delta ${(filteredVsVector.avgLatencyMs >= 0 ? "+" : "") + filteredVsVector.avgLatencyMs.toFixed(2)} ms`,
    `- Hybrid vs filtered-vector: Recall delta ${(hybridVsFiltered.recallAtK >= 0 ? "+" : "") + hybridVsFiltered.recallAtK.toFixed(4)}, MRR delta ${(hybridVsFiltered.meanReciprocalRank >= 0 ? "+" : "") + hybridVsFiltered.meanReciprocalRank.toFixed(4)}, latency delta ${(hybridVsFiltered.avgLatencyMs >= 0 ? "+" : "") + hybridVsFiltered.avgLatencyMs.toFixed(2)} ms`,
    "",
    "## Per-Query Top Match Rank",
    "",
  ];

  for (const query of queries) {
    const vectorEntry = runByMode.vector.entries.find((entry) => entry.id === query.id);
    const filteredEntry = runByMode["filtered-vector"].entries.find(
      (entry) => entry.id === query.id,
    );
    const hybridEntry = runByMode.hybrid.entries.find((entry) => entry.id === query.id);

    markdown.push(
      `- ${query.id}: vector=${vectorEntry?.topMatchRank ?? "none"}, filtered-vector=${filteredEntry?.topMatchRank ?? "none"}, hybrid=${hybridEntry?.topMatchRank ?? "none"}`,
    );
  }

  markdown.push("");

  fs.writeFileSync(markdownPath, markdown.join("\n"), "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        scoreSchemaVersion: SCORE_SCHEMA_VERSION,
        scoreType: SCORE_TYPE,
        queriesPath,
        summaries: {
          vector: vectorSummary,
          filteredVector: filteredSummary,
          hybrid: hybridSummary,
        },
        deltas: {
          filteredVectorVsVector: filteredVsVector,
          hybridVsFilteredVector: hybridVsFiltered,
        },
        runs,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Report: ${markdownPath}`);
  console.log(`JSON: ${jsonPath}`);
  console.log("Summaries:");
  console.log(
    JSON.stringify(
      {
        vector: vectorSummary,
        filteredVector: filteredSummary,
        hybrid: hybridSummary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Retrieval mode evaluation failed:", error.message);
  process.exitCode = 1;
});
