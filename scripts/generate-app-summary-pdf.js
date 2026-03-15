const fs = require("fs");
const path = require("path");
const puppeteer = require("../gui/server/node_modules/puppeteer");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "output", "pdf");
const TMP_DIR = path.join(ROOT, "tmp", "pdfs");
const OUTPUT_PDF = path.join(OUTPUT_DIR, "local-rag-app-summary.pdf");
const OUTPUT_HTML = path.join(TMP_DIR, "local-rag-app-summary.html");
const OUTPUT_PNG = path.join(TMP_DIR, "local-rag-app-summary.png");

const browserCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function renderList(items) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

const data = {
  title: "Local RAG Project v2",
  subtitle: "One-page repo summary",
  whatItIs:
    "A local retrieval-augmented generation app that lets users ingest local folders, index them into LanceDB, and chat against those documents through a web UI backed by Ollama. The repo combines a React client, a Node/Express API, and PowerShell utilities, with Docker Compose as the fastest full-stack launch path.",
  whoItsFor:
    "Primary persona is not explicitly defined in the repo. Repo evidence points to developers or Windows power users who want private, local document Q&A and local model management.",
  features: [
    "Chats over ingested local documents with streaming responses from `/api/chat`.",
    "Queues folder ingestion jobs in the background instead of blocking the UI.",
    "Browses allowed local folders from the UI with path-boundary and symlink checks.",
    "Parses and ingests `.md`, `.txt`, `.ps1`, `.xml`, and `.pdf` files.",
    "Stores embeddings and metadata in local LanceDB collections with per-file manifests.",
    "Surfaces model readiness, system health, queue state, and vector index metrics in the dashboard.",
    "Supports vector, filtered-vector, and hybrid retrieval modes in the backend API.",
  ],
  architecture: [
    "React/Vite client (`gui/client/react-client`) renders chat, model selection, folder browse, queue, and analytics panels.",
    "Node/Express server (`gui/server/server.js`) exposes `/api/chat`, `/api/queue`, `/api/browse`, `/api/models`, `/api/health`, and `/api/index/metrics`.",
    "Ingestion pipeline (`gui/server/IngestionQueue.js`) scans folders, hashes files, parses PDFs, chunks content, embeds via Ollama, and writes LanceDB rows plus a JSON manifest.",
    "Query flow embeds the user message with Ollama, searches LanceDB through `VectorStore`, builds context, then streams answer tokens and citations back over SSE.",
    "Supporting config and PowerShell assets live in `config/project-config.psd1` and `PowerShell Scripts/`; explicit runtime use by the current web path is partly present but not fully documented. If deeper service boundaries are needed: Not found in repo.",
  ],
  runSteps: [
    "Prereq: Docker Desktop or Docker Engine with Compose.",
    "From the repo root, run `docker-compose up --build`.",
    "Open `http://localhost:8080`.",
    "If models are missing, `ollama-init` pulls defaults from compose: `nomic-embed-text` and `llama3.1:8b`.",
  ],
  evidence:
    "Repo evidence used: README.md, docker-compose.yml, config/project-config.psd1, gui/server/server.js, gui/server/IngestionQueue.js, gui/server/lib/vectorStore.js, gui/server/lib/documentParser.js, gui/client/react-client/src/App.jsx, gui/client/react-client/src/hooks/useRagApi.js.",
};

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.title)}</title>
  <style>
    @page {
      size: Letter;
      margin: 0.42in;
    }

    :root {
      --ink: #16324f;
      --muted: #5d6b7c;
      --soft: #eef3f7;
      --line: #d5dee8;
      --accent: #0f766e;
      --accent-soft: #dff4ef;
      --heading: #102a43;
      --paper: #ffffff;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: linear-gradient(180deg, #f7fbfd 0%, #ffffff 28%, #f4f7fb 100%);
      color: var(--ink);
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    }

    .page {
      width: 100%;
      min-height: 9.66in;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 24px 24px 20px;
      box-shadow: 0 14px 40px rgba(16, 42, 67, 0.08);
      position: relative;
      overflow: hidden;
    }

    .page::before {
      content: "";
      position: absolute;
      inset: 0 auto auto 0;
      width: 100%;
      height: 8px;
      background: linear-gradient(90deg, #0f766e, #0ea5e9, #1d4ed8);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 18px;
      margin-bottom: 18px;
    }

    .title {
      margin: 0;
      font-size: 28px;
      line-height: 1.05;
      color: var(--heading);
      letter-spacing: -0.03em;
    }

    .subtitle {
      margin-top: 5px;
      font-size: 11.5px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .badge {
      align-self: flex-start;
      padding: 8px 11px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      white-space: nowrap;
    }

    .grid {
      display: grid;
      grid-template-columns: 1.1fr 0.95fr;
      gap: 18px;
    }

    .section {
      margin-bottom: 13px;
    }

    .section h2 {
      margin: 0 0 5px;
      font-size: 11.5px;
      color: var(--accent);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .section p {
      margin: 0;
      font-size: 11.2px;
      line-height: 1.45;
      color: var(--ink);
    }

    .card {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(244,248,251,0.92));
      padding: 13px 14px;
    }

    ul {
      margin: 0;
      padding-left: 15px;
    }

    li {
      margin: 0 0 6px;
      font-size: 10.8px;
      line-height: 1.38;
      color: var(--ink);
    }

    li:last-child {
      margin-bottom: 0;
    }

    .mini-note {
      margin-top: 10px;
      padding: 9px 10px;
      border-radius: 11px;
      background: var(--soft);
      font-size: 9.4px;
      line-height: 1.38;
      color: var(--muted);
    }

    .run-list li code,
    .mini-note code {
      font-family: Consolas, "Courier New", monospace;
      font-size: 0.95em;
      background: rgba(16, 42, 67, 0.06);
      padding: 1px 3px;
      border-radius: 4px;
    }

    .footer {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid var(--line);
      font-size: 8.7px;
      line-height: 1.32;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <main class="page">
    <div class="header">
      <div>
        <h1 class="title">${escapeHtml(data.title)}</h1>
        <div class="subtitle">${escapeHtml(data.subtitle)}</div>
      </div>
      <div class="badge">Repo-backed summary</div>
    </div>

    <div class="grid">
      <section>
        <div class="section card">
          <h2>What It Is</h2>
          <p>${escapeHtml(data.whatItIs)}</p>
        </div>

        <div class="section card">
          <h2>Who It's For</h2>
          <p>${escapeHtml(data.whoItsFor)}</p>
        </div>

        <div class="section card">
          <h2>What It Does</h2>
          <ul>${renderList(data.features)}</ul>
        </div>
      </section>

      <section>
        <div class="section card">
          <h2>How It Works</h2>
          <ul>${renderList(data.architecture)}</ul>
        </div>

        <div class="section card">
          <h2>How to Run</h2>
          <ul class="run-list">${renderList(data.runSteps)}</ul>
          <div class="mini-note">${escapeHtml(data.evidence)}</div>
        </div>
      </section>
    </div>

    <div class="footer">
      Single-page summary generated from repository contents only. Where the repo did not make a detail explicit, the text marks that directly.
    </div>
  </main>
</body>
</html>`;

async function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(TMP_DIR);
  fs.writeFileSync(OUTPUT_HTML, html, "utf8");

  let executablePath = null;
  for (const candidate of browserCandidates) {
    if (candidate && fs.existsSync(candidate)) {
      executablePath = candidate;
      break;
    }
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1275, height: 1650, deviceScaleFactor: 1.5 });
    await page.setContent(html, { waitUntil: "networkidle0" });

    await page.pdf({
      path: OUTPUT_PDF,
      format: "Letter",
      printBackground: true,
      margin: {
        top: "0.42in",
        right: "0.42in",
        bottom: "0.42in",
        left: "0.42in",
      },
      preferCSSPageSize: true,
    });

    await page.screenshot({
      path: OUTPUT_PNG,
      fullPage: true,
      type: "png",
    });

    console.log(JSON.stringify({ pdf: OUTPUT_PDF, html: OUTPUT_HTML, png: OUTPUT_PNG }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
