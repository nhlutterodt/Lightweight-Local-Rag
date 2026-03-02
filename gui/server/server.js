import express from "express";
import cors from "cors";
import { spawn, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import PowerShellRunner from "./PowerShellRunner.js";
import IngestionQueue from "./IngestionQueue.js";
import { VectorStore } from "./lib/vectorStore.js";
import { embed, chatStream } from "./lib/ollamaClient.js";
import { QueryLogger } from "./lib/queryLogger.js";
import * as lancedb from "@lancedb/lancedb";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration Sync ---
function loadProjectConfig() {
  const rootDir = path.join(__dirname, "..", "..");
  const scriptPath = path.join(
    rootDir,
    "PowerShell Scripts",
    "Get-ProjectConfig.ps1",
  );

  try {
    const result = spawnSync(
      "pwsh",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { encoding: "utf8" },
    );

    if (result.status === 0 && result.stdout) {
      const parsed = JSON.parse(result.stdout);
      console.log("[Config Sync] Successfully loaded project configuration.");
      return parsed;
    }
    console.warn(
      "[Config Sync Warning] Script finished with non-zero code or empty output.",
    );
  } catch (err) {
    console.error(
      "[Config Sync Error] Failed to execute config sync:",
      err.message,
    );
  }
  return null;
}

const config = loadProjectConfig();

const app = express();
const PORT = process.env.PORT || 3001;
const OLLAMA_URL =
  process.env.OLLAMA_URL ||
  config?.RAG?.OllamaUrl ||
  config?.Ollama?.ServiceUrl ||
  "http://localhost:11434";
const PS_SCRIPTS_DIR = config?.Paths?.ScriptsDirectory
  ? path.join(__dirname, "..", "..", config.Paths.ScriptsDirectory)
  : path.join(__dirname, "..", "..", "PowerShell Scripts");

const psRunner = new PowerShellRunner(PS_SCRIPTS_DIR);
const ingestQueue = new IngestionQueue();
if (config) ingestQueue.setConfig(config);

// ==========================================
// 1. LanceDB Initialization (Async)
// ==========================================
let store;
let collectionName = "TestIngestNodeFinal"; // Native JS Insertion test

async function initializeVectorStore() {
  const dataDir = config?.Paths?.DataDir
    ? config.Paths.DataDir
    : path.join(__dirname, "..", "..", "PowerShell Scripts", "Data");

  const dbDir = path.join(dataDir, "vector_store.lance");
  store = new VectorStore();
  try {
    // We pass the required embedding model (from project-config) as validation
    const targetModel = config?.RAG?.EmbeddingModel || "nomic-embed-text";
    await store.load(dbDir, collectionName, targetModel);
    console.log(
      `[VectorStore] Connected to LanceDB at ${dbDir}, Collection: ${collectionName}. Model=${store.model || "legacy"}`,
    );
  } catch (err) {
    console.error(
      "[VectorStore] Warning: Initialization failed or table missing.",
    );
    console.error(err.message);
  }
}

// Call init. Server starts anyway, but RAG requires it to succeed eventually.
initializeVectorStore();

// Query Logger Setup
const logger = new QueryLogger(
  path.join(__dirname, "..", "..", "logs", "query_log.jsonl"),
);

const shutdown = async () => {
  console.log("Shutting down gracefully...");
  await logger.flush();
  process.exit();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

app.use(cors());
app.use(express.json());

// Serve React dist if available, else fallback to old vanilla client
const reactDistPath = path.join(__dirname, "../client/react-client/dist");
if (fs.existsSync(reactDistPath)) {
  app.use(express.static(reactDistPath));
} else {
  app.use(express.static(path.join(__dirname, "../client")));
}

// --- Security Helpers ---
function isValidCollection(name) {
  return /^[a-zA-Z0-9_\-]+$/.test(name);
}

function isSafePath(inputPath) {
  // 1. Must be absolute
  if (!path.isAbsolute(inputPath)) return false;

  // 2. Block system roots broadly (e.g. C:\Windows, /input, /sys)
  const normalized = path.normalize(inputPath).toLowerCase();

  if (
    normalized.startsWith("c:\\windows") ||
    normalized.startsWith("c:\\program files") ||
    normalized.startsWith("/etc") ||
    normalized.startsWith("/var")
  ) {
    return false;
  }

  // 3. Must not contain traversal relative components after normalization (path.normalize handles .. mostly)
  if (normalized.includes("..")) return false;

  return true;
}

// --- Native Folder Selection ---
app.get("/api/browse", (req, res) => {
  const ps = psRunner.spawn("Select-Folder.ps1", []);
  let result = "";

  ps.stdout.on("data", (data) => (result += data.toString()));

  ps.on("close", (code) => {
    try {
      if (result.trim()) {
        const parsed = JSON.parse(result);
        res.json(parsed);
      } else {
        throw new Error("No output from native dialog script");
      }
    } catch (e) {
      res.status(500).json({
        status: "error",
        message: "Failed to parse folder selection result",
        error: e.message,
      });
    }
  });
});

// --- Queue Management ---

// Get current queue state
app.get("/api/queue", (req, res) => {
  res.json(ingestQueue.getJobs());
});

// Stream real-time queue states via SSE
app.get("/api/queue/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send initial state
  res.write(`data: ${JSON.stringify(ingestQueue.getJobs())}\n\n`);

  // Push updates natively when the queue saves state
  const onUpdate = (jobs) => {
    res.write(`data: ${JSON.stringify(jobs)}\n\n`);
  };

  ingestQueue.on("update", onUpdate);

  // Clean up listener when client closes connection
  req.on("close", () => {
    ingestQueue.removeListener("update", onUpdate);
  });
});

// Enqueue a new ingestion task
app.post("/api/queue", (req, res) => {
  const { path: folderPath, collection } = req.body;
  if (!folderPath || !collection) {
    return res.status(400).json({ error: "path and collection are required" });
  }

  // Security Checks
  if (!isValidCollection(collection)) {
    return res
      .status(400)
      .json({ error: "Invalid collection name (alphanumeric only)" });
  }
  if (!isSafePath(folderPath)) {
    return res.status(403).json({ error: "Unsafe or restricted input path" });
  }

  const job = ingestQueue.enqueue(folderPath, collection);
  res.status(201).json(job);
});

// Cancel a pending job
app.delete("/api/queue/:id", (req, res) => {
  const success = ingestQueue.cancelJob(req.params.id);
  if (success) {
    res.json({ status: "cancelled" });
  } else {
    res.status(400).json({
      error: "Job cannot be cancelled (non-existent or already running)",
    });
  }
});

// Health Check Caching
let healthCache = null;
let lastHealthUpdate = 0;
const HEALTH_CACHE_TTL = 15000; // 15s

app.get("/api/health", (req, res) => {
  const now = Date.now();
  if (healthCache && now - lastHealthUpdate < HEALTH_CACHE_TTL) {
    return res.json(healthCache);
  }

  const ps = psRunner.spawn("Invoke-SystemHealth.ps1", []);
  let result = "";
  ps.stdout.on("data", (data) => (result += data.toString()));

  ps.on("close", (code) => {
    try {
      if (result.trim()) {
        const health = JSON.parse(result);
        healthCache = health;
        lastHealthUpdate = now;
        res.json(health);
      } else {
        throw new Error("No output from health script");
      }
    } catch (e) {
      res.status(500).json({
        type: "System Health Error",
        status: 500,
        detail: e.message,
      });
    }
  });
});

// --- Caching for Performance ---
let metricsCache = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 5000; // 5s

// Vector Index Metrics
app.get("/api/index/metrics", async (req, res) => {
  const now = Date.now();
  if (metricsCache && now - lastCacheUpdate < CACHE_TTL) {
    return res.json(metricsCache);
  }

  try {
    const dataDir = config?.Paths?.DataDir
      ? config.Paths.DataDir
      : path.join(__dirname, "..", "..", "PowerShell Scripts", "Data");
    const dbDir = path.join(dataDir, "vector_store.lance");

    // If DB doesn't exist, return empty
    if (!fs.existsSync(dbDir)) {
      metricsCache = [];
      lastCacheUpdate = now;
      return res.json([]);
    }

    const db = await lancedb.connect(dbDir);
    const tableNames = await db.tableNames();
    const metrics = [];

    // Calculate approximate size of lance directory
    let totalDbSize = 0;
    try {
      totalDbSize = fs
        .readdirSync(dbDir)
        .reduce(
          (acc, file) => acc + fs.statSync(path.join(dbDir, file)).size,
          0,
        );
    } catch (e) {}

    for (const name of tableNames) {
      try {
        const table = await db.openTable(name);
        const count = await table.countRows();

        metrics.push({
          name: name,
          file: `vector_store.lance/${name}`,
          lastModified: new Date().toISOString(),
          totalSizeBytes: Math.floor(totalDbSize / tableNames.length), // rough physical estimate
          vectorCount: count,
          dimension: store?.dims || 0,
          health: "OK",
          ChunkCount: count,
          EmbeddingModel: config?.RAG?.EmbeddingModel || "unknown",
        });
      } catch (err) {
        metrics.push({
          name: name,
          health: "CORRUPT",
          error: err.message,
        });
      }
    }

    metricsCache = metrics;
    lastCacheUpdate = now;
    res.json(metrics);
  } catch (e) {
    console.error("[Metrics Error]", e);
    res.status(500).json({ status: "error", message: e.message });
  }
});

app.post("/api/log", (req, res) => {
  const { message, level = "INFO", category = "UI" } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const ps = psRunner.spawn("Append-LogEntry.ps1", [
    "-Message",
    message,
    "-Level",
    level,
    "-Category",
    category,
  ]);

  let result = "";
  ps.stdout.on("data", (data) => (result += data.toString()));

  ps.on("close", (code) => {
    if (code === 0) {
      res.json({ status: "logged" });
    } else {
      res.status(500).json({ error: "Logging failed", details: result });
    }
  });
});

// Embedding model families — these cannot be used for chat
const EMBED_FAMILIES = new Set(["bert", "nomic-bert"]);

function classifyModelRole(model) {
  const family = model.details?.family?.toLowerCase() || "";
  if (EMBED_FAMILIES.has(family)) return "embed";
  return "chat";
}

// Enriched Model Endpoint
app.get("/api/models", async (req, res) => {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`);
    const rawModels = response.data?.models || [];

    // Classify each model
    const models = rawModels.map((m) => ({
      name: m.name,
      size: m.size,
      family: m.details?.family || "unknown",
      parameterSize: m.details?.parameter_size || "unknown",
      quantization: m.details?.quantization_level || "unknown",
      role: classifyModelRole(m),
    }));

    // Check required models from config
    const requiredEmbedName = config?.RAG?.EmbeddingModel || "nomic-embed-text";
    const requiredChatName = config?.RAG?.ChatModel || "llama3.1:8b";

    const embedInstalled = rawModels.some(
      (m) =>
        m.name === requiredEmbedName ||
        m.name.startsWith(requiredEmbedName + ":"),
    );
    const chatInstalled = rawModels.some(
      (m) =>
        m.name === requiredChatName ||
        m.name.startsWith(requiredChatName + ":"),
    );

    const required = {
      embed: {
        name: requiredEmbedName,
        installed: embedInstalled,
        ...(embedInstalled
          ? {}
          : { pullCommand: `ollama pull ${requiredEmbedName}` }),
      },
      chat: {
        name: requiredChatName,
        installed: chatInstalled,
        ...(chatInstalled
          ? {}
          : { pullCommand: `ollama pull ${requiredChatName}` }),
      },
    };

    res.json({
      models,
      required,
      ready: embedInstalled && chatInstalled,
    });
  } catch (error) {
    res
      .status(502)
      .json({ error: "Ollama service unreachable", details: error.message });
  }
});

// Main Chat / RAG Endpoint
app.post("/api/chat", async (req, res) => {
  const {
    messages,
    collection = "TestIngest",
    model = config?.RAG?.ChatModel || "llama3.1:8b",
  } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  if (!isValidCollection(collection)) {
    return res.status(400).json({ error: "Invalid collection name" });
  }

  const lastUserMessage = messages[messages.length - 1].content;

  try {
    console.log(
      `[RAG] Query: "${lastUserMessage}" | Collection: ${collection}`,
    );

    if (!store) {
      return res.status(503).json({ error: "No documents ingested yet." });
    }

    const t0 = process.hrtime.bigint();

    // 1. JS Native Retrieval
    const tEmbedStart = process.hrtime.bigint();
    const queryVector = await embed(
      lastUserMessage,
      config?.RAG?.EmbeddingModel || "nomic-embed-text",
      OLLAMA_URL,
    );
    const tEmbedEnd = process.hrtime.bigint();

    // --- 2. Hot-Path Retrieval (LanceDB) ---
    const tSearchStart = performance.now();

    // store.findNearest is now an async LanceDB projection
    const results = await store.findNearest(
      queryVector,
      config.RAG.TopK,
      config.RAG.MinScore,
    );
    const searchMs = performance.now() - tSearchStart;

    // 2. Build Context with Pre-flight Token Budget Enforcement
    // Rough estimate: 1 word ≈ 1.3 tokens.
    // We aim to keep total context well under an 8k limit (e.g. 4000 max context tokens)
    const MAX_CONTEXT_TOKENS = 4000;
    let currentTokenEstimate = 0;
    const approvedResults = [];

    for (const r of results) {
      const chunkWords = (r.ChunkText || r.TextPreview || "").split(
        /\s+/,
      ).length;
      const chunkTokens = Math.ceil(chunkWords * 1.3);

      if (currentTokenEstimate + chunkTokens > MAX_CONTEXT_TOKENS) {
        console.warn(
          `[RAG Context] Dropped citation ${r.FileName} to enforce token budget limit.`,
        );
        continue;
      }

      approvedResults.push(r);
      currentTokenEstimate += chunkTokens;
    }

    const contextText =
      approvedResults.length > 0
        ? approvedResults
            .map(
              (r) => `[Source: ${r.FileName}]\n${r.ChunkText || r.TextPreview}`,
            )
            .join("\n\n")
        : "No relevant local documents found.";

    const logResults = approvedResults.map((r) => ({
      score: r.score,
      fileName: r.FileName,
      chunkIndex: r.ChunkIndex,
      headerContext: r.HeaderContext,
      preview: r.TextPreview,
    }));

    const citations = approvedResults.map((r) => ({
      fileName: r.FileName,
      headerContext: r.HeaderContext,
      score: r.score,
      preview: r.TextPreview,
    }));

    // 3. Compute Logging Data
    const topScore = results.length > 0 ? results[0].score : 0;
    const minScoreThresh = config?.RAG?.MinScore || 0.5;
    const lowConfidence =
      results.length === 0 || topScore < minScoreThresh + 0.1;

    const logEntry = {
      timestamp: new Date().toISOString(),
      query: lastUserMessage.substring(0, 500),
      embeddingModel: config?.RAG?.EmbeddingModel || "nomic-embed-text",
      chatModel: model,
      topK: config?.RAG?.TopK || 5,
      minScore: minScoreThresh,
      resultCount: results.length,
      results: logResults,
      lowConfidence: lowConfidence,
    };

    logger.log(logEntry).catch((err) => console.error("[QueryLogger]", err));

    // 4. Output Headers, Server-Timing, & System Prompt
    const embedMs = Number(tEmbedEnd - tEmbedStart) / 1e6;
    const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
    res.setHeader(
      "Server-Timing",
      `embed;dur=${embedMs.toFixed(1)}, search;dur=${searchMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`,
    );
    console.log(
      `[RAG Timing] embed=${embedMs.toFixed(1)}ms  search=${searchMs.toFixed(1)}ms  total=${totalMs.toFixed(1)}ms`,
    );

    res.write(`data: ${JSON.stringify({ type: "status", message: "" })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "metadata", citations })}\n\n`);

    const systemPrompt = `You are a helpful assistant. Use ONLY the provided context to answer. If unsure, say you don't know.\n\nCONTEXT:\n${contextText}`;
    const ollamaMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // AbortController setup
    const abortController = new AbortController();
    req.on("close", () => {
      console.log(
        `[RAG Stream] Client disconnected natively, aborting LLM generation.`,
      );
      abortController.abort();
    });

    // 5. Native JS Streaming
    await chatStream(
      ollamaMessages,
      model,
      OLLAMA_URL,
      (chunkText) => {
        res.write(
          `data: ${JSON.stringify({ message: { content: chunkText.toString() } })}\n\n`,
        );
      },
      abortController.signal,
    );

    res.end();
  } catch (err) {
    if (err.message.includes("mismatch")) {
      // If we haven't sent headers yet, we can return 500
      if (!res.headersSent) {
        return res
          .status(500)
          .json({ error: "Configuration Error", details: err.message });
      }
    }
    console.error("[Native Chat Error]:", err.message);

    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: "Failed to generate response", details: err.message });
    } else {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`,
      );
      res.end();
    }
  }
});

// Ingestion Endpoint
// Legacy Endpoint Removed (Critique 1 - PowerShell Ejection)
app.post("/api/ingest", (req, res) => {
  res
    .status(410)
    .json({ error: "Deprecated. Use /api/queue for native Node ingestion." });
});

// Only start server if run directly (not imported)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`🚀 Bridge Server running at http://localhost:${PORT}`);
    console.log(`📂 PowerShell Scripts: ${PS_SCRIPTS_DIR}`);
  });
}

export default app;
