import express from "express";
import cors from "cors";
import { spawn, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import PowerShellRunner from "./PowerShellRunner.js";
import IngestionQueue from "./IngestionQueue.js";

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
  config?.Ollama?.ServiceUrl ||
  "http://localhost:11434";
const PS_SCRIPTS_DIR = config?.Paths?.ScriptsDirectory
  ? path.join(__dirname, "..", "..", config.Paths.ScriptsDirectory)
  : path.join(__dirname, "..", "..", "PowerShell Scripts");

const psRunner = new PowerShellRunner(PS_SCRIPTS_DIR);
const ingestQueue = new IngestionQueue(psRunner);

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

// Proxy to Ollama Models
app.get("/api/models", async (req, res) => {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`);
    res.json(response.data);
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
    model = "llama3.1:8b",
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

    // 1. Perform RAG Retrieval via PowerShell
    const ps = psRunner.spawn("Query-Rag.ps1", [
      "-Query",
      lastUserMessage,
      "-CollectionName",
      collection,
      "-Json",
    ]);

    let resultData = "";
    PowerShellRunner.parseJsonStream(
      ps,
      (obj) => {
        if (obj.type === "status") {
          res.write(`data: ${JSON.stringify(obj)}\n\n`);
        } else {
          // Assume it's the final RAG result if not a status update
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
        console.warn(`[PS Warn] ${err}`);
      }
    });

    ps.on("close", async (code) => {
      let contextText = "No relevant local documents found.";
      let citations = [];

      try {
        const trimmedResult = resultData.replace(/SIGNAL:[A-Z]+/g, "").trim();
        if (trimmedResult) {
          const ragResult = JSON.parse(trimmedResult);
          if (ragResult.Results && ragResult.Results.length > 0) {
            contextText = ragResult.Results.map(
              (r) => `[Source: ${r.FileName}]\n${r.ChunkText || r.TextPreview}`,
            ).join("\n\n");
            citations = ragResult.Results.map((r) => ({
              file: r.FileName,
              score: r.Score,
              preview: r.TextPreview,
            }));
          }
        }
      } catch (e) {
        // Only log error if it's not empty
        if (resultData.trim())
          console.error("[RAG Error]:", e.message, "Data:", resultData);
      }

      const systemPrompt = `You are a helpful assistant. Use ONLY the provided context to answer. If unsure, say you don't know.\n\nCONTEXT:\n${contextText}`;
      const ollamaMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
      ];

      try {
        // Clear status before starting chat
        res.write(
          `data: ${JSON.stringify({ type: "status", message: "" })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({ type: "metadata", citations })}\n\n`,
        );

        const ollamaResponse = await axios.post(
          `${OLLAMA_URL}/api/chat`,
          {
            model,
            messages: ollamaMessages,
            stream: true,
            think: true,
          },
          { responseType: "stream" },
        );

        ollamaResponse.data.on("data", (chunk) => {
          res.write(`data: ${chunk.toString()}\n\n`);
        });

        ollamaResponse.data.on("end", () => res.end());
      } catch (err) {
        console.error("[Ollama Error]:", err.message);
        res.write(
          `data: ${JSON.stringify({ error: "Ollama Error", details: err.message })}\n\n`,
        );
        res.end();
      }
    });

    ps.on("error", (err) => {
      console.error("[PS Spawn Error]:", err.message);
      res
        .status(500)
        .json({ error: "Failed to start RAG engine", details: err.message });
    });
  } catch (err) {
    console.error("[Bridge Fatal Error]:", err.message);
    res
      .status(500)
      .json({ error: "Internal Bridge Error", details: err.message });
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
