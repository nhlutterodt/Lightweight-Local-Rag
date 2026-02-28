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
const ingestQueue = new IngestionQueue(psRunner);

// Native RAG Engine State
let store = new VectorStore();
const dataDir = path.join(PS_SCRIPTS_DIR, "Data");
const binPath = path.join(dataDir, "ProjectDocs.vectors.bin");
const metaPath = path.join(dataDir, "ProjectDocs.metadata.json");

(async () => {
  try {
    await store.load(binPath, metaPath);
    console.log(
      `[VectorStore] Loaded: ${store.size} vectors, model=${store.model || "legacy"}`,
    );
  } catch (err) {
    store = null;
    console.warn(
      `[VectorStore Warning] Store could not be loaded at startup: ${err.message}. Waiting for ingest...`,
    );
  }
})();

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
app.use(express.static(path.join(__dirname, "../client")));

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

// Health Check
app.get("/api/health", (req, res) => {
  const ps = psRunner.spawn("Invoke-SystemHealth.ps1", []);
  let result = "";
  ps.stdout.on("data", (data) => (result += data.toString()));

  ps.on("close", (code) => {
    try {
      if (result.trim()) {
        const health = JSON.parse(result);
        res.json(health);
      } else {
        throw new Error("No output from health script");
      }
    } catch (e) {
      res.status(500).json({
        status: "error",
        message: "Health check diagnostic failed",
        error: e.message,
      });
    }
  });
});

// --- Caching for Performance ---
let metricsCache = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 5000; // 5s

// Vector Index Metrics
app.get("/api/index/metrics", (req, res) => {
  const now = Date.now();
  if (metricsCache && now - lastCacheUpdate < CACHE_TTL) {
    return res.json(metricsCache);
  }

  const ps = psRunner.spawn("Get-VectorMetrics.ps1", []);
  let result = "";
  ps.stdout.on("data", (data) => (result += data.toString()));

  ps.on("close", (code) => {
    try {
      if (code === 0 && result.trim()) {
        const metrics = JSON.parse(result);
        metricsCache = metrics;
        lastCacheUpdate = Date.now();
        res.json(metrics);
      } else {
        res
          .status(500)
          .json({ error: "Failed to fetch metrics", details: result });
      }
    } catch (e) {
      res.status(500).json({ error: "Parsing failed", details: result });
    }
  });
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
    const queryVec = await embed(
      lastUserMessage,
      config?.RAG?.EmbeddingModel || "nomic-embed-text",
      OLLAMA_URL,
    );
    const tEmbedEnd = process.hrtime.bigint();

    const tSearchStart = process.hrtime.bigint();
    const results = store.findNearest(
      queryVec,
      config?.RAG?.TopK || 5,
      config?.RAG?.MinScore || 0.5,
      config?.RAG?.EmbeddingModel,
    );
    const tSearchEnd = process.hrtime.bigint();

    // 2. Build Context
    const contextText =
      results.length > 0
        ? results
            .map(
              (r) => `[Source: ${r.FileName}]\n${r.ChunkText || r.TextPreview}`,
            )
            .join("\n\n")
        : "No relevant local documents found.";

    const logResults = results.map((r) => ({
      score: r.score,
      fileName: r.FileName,
      chunkIndex: r.ChunkIndex,
      headerContext: r.HeaderContext,
      preview: r.TextPreview,
    }));

    const citations = results.map((r) => ({
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
    const searchMs = Number(tSearchEnd - tSearchStart) / 1e6;
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

    // 5. Native JS Streaming
    await chatStream(ollamaMessages, model, OLLAMA_URL, (chunkText) => {
      res.write(
        `data: ${JSON.stringify({ message: { content: chunkText.toString() } })}\n\n`,
      );
    });

    res.end();
  } catch (err) {
    if (err.message.includes("mismatch")) {
      return res
        .status(500)
        .json({ error: "Configuration Error", details: err.message });
    }
    console.error("[Native Chat Error]:", err.message);
    res
      .status(500)
      .json({ error: "Failed to generate response", details: err.message });
  }
});

// Ingestion Endpoint
app.post("/api/ingest", (req, res) => {
  const { path: sourcePath, collection } = req.body;

  if (!sourcePath || !collection) {
    return res
      .status(400)
      .json({ error: "Source path and collection name are required" });
  }

  if (!isValidCollection(collection)) {
    return res.status(400).json({ error: "Invalid collection name" });
  }
  if (!isSafePath(sourcePath)) {
    return res.status(403).json({ error: "Unsafe or restricted input path" });
  }

  // Optional Queue Delegation
  if (req.body.queue) {
    const job = ingestQueue.enqueue(sourcePath, collection);
    return res.status(202).json(job);
  }

  // Conflict Prevention
  if (ingestQueue.isWorking) {
    return res.status(409).json({
      error: "Conflict",
      message: "An ingestion task is already running in the background queue.",
    });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  console.log(
    `[Ingest] Starting vectorization for: ${sourcePath} -> ${collection}`,
  );

  const ps = psRunner.spawn("Ingest-Documents.ps1", [
    "-SourcePath",
    sourcePath,
    "-CollectionName",
    collection,
    "-Signal",
  ]);

  let resultData = "";

  PowerShellRunner.parseJsonStream(
    ps,
    (obj) => {
      if (obj.type === "status") {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      } else {
        resultData += JSON.stringify(obj);
      }
    },
    (raw) => {
      resultData += raw;
    },
  );

  ps.stderr.on("data", (data) => {
    const err = data.toString();
    if (!err.includes("PowerShell") && !err.includes("Copyright")) {
      console.warn(`[Ingest Warn] ${err}`);
    }
  });

  ps.on("close", (code) => {
    console.log(`[Ingest] Process finished (Code: ${code})`);
    try {
      const reportData = resultData.replace(/SIGNAL:[A-Z]+/g, "").trim();
      const report = JSON.parse(reportData);
      res.write(`data: ${JSON.stringify({ type: "complete", report })}\n\n`);

      // Hot Reload VectorStore after ingest completes
      store = new VectorStore();
      store
        .load(binPath, metaPath)
        .then(() =>
          console.log(
            `[VectorStore] Hot reloaded after ingest: ${store.size} vectors`,
          ),
        )
        .catch((err) =>
          console.error(
            `[VectorStore Error] Failed to hot-reload: ${err.message}`,
          ),
        );
    } catch (e) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: "Ingestion failed to generate report" })}\n\n`,
      );
    }
    res.end();
  });
});

// Only start server if run directly (not imported)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`🚀 Bridge Server running at http://localhost:${PORT}`);
    console.log(`📂 PowerShell Scripts: ${PS_SCRIPTS_DIR}`);
  });
}

export default app;
