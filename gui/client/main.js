const API_URL = "http://localhost:3001/api";

/**
 * Send logs to the backend XML logger
 */
async function remoteLog(message, level = "INFO", category = "UI") {
  try {
    await fetch(`${API_URL}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, level, category }),
    });
  } catch (e) {
    console.warn("[Remote Log Failed]", e.message);
  }
}

// DOM Elements
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendMessage");
const modelSelect = document.getElementById("modelSelect");
const collectionInput = document.getElementById("collectionName");
const statusIndicator = document.getElementById("connectionStatus");
const ingestPathInput = document.getElementById("ingestPath");
const startIngestBtn = document.getElementById("startIngest");
const ingestStatusBox = document.getElementById("ingestStatus");
const ingestStatusText = document.getElementById("ingestStatusText");
const clearBtn = document.getElementById("clearChat");
const indexMonitor = document.getElementById("indexMonitor");
const enqueueIngestBtn = document.getElementById("enqueueIngest");
const queueManager = document.getElementById("queueManager");

let chatHistory = [];
let isGenerating = false;

startIngestBtn.addEventListener("click", handleIngest);
enqueueIngestBtn.addEventListener("click", handleEnqueue);

/**
 * Handle Folder Ingestion
 */
async function handleIngest() {
  const path = ingestPathInput.value.trim();
  const collection = collectionInput.value.trim();

  if (!path) {
    alert("Please provide an absolute path to a folder.");
    return;
  }

  startIngestBtn.disabled = true;
  ingestStatusBox.classList.remove("hidden");
  ingestStatusText.innerText = "Initializing Backend...";

  try {
    const response = await fetch(`${API_URL}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, collection }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(t.slice(6));
          if (data.type === "status") {
            ingestStatusText.innerText = data.message;
          } else if (data.type === "complete") {
            const r = data.report;
            ingestStatusText.innerHTML = `<strong>Vectorization Complete!</strong><br>📄 ${r.processed} Files<br>🔢 ${r.total} Total Vectors`;
            setTimeout(() => {
              ingestStatusBox.classList.add("hidden");
              startIngestBtn.disabled = false;
              fetchIndexMetrics(); // Refresh monitor after ingest
            }, 8000);
          } else if (data.type === "error") {
            throw new Error(data.message);
          }
        } catch (e) {
          if (t.includes("complete")) continue;
          console.error("[Ingest Stream Error]", e);
        }
      }
    }
  } catch (err) {
    ingestStatusText.innerText = "❌ Error: " + err.message;
    startIngestBtn.disabled = false;
    remoteLog(`Ingestion failed: ${err.message}`, "ERROR", "INGEST");
  }
}

/**
 * Handle Job Enqueue
 */
async function handleEnqueue() {
  const path = ingestPathInput.value.trim();
  const collection = collectionInput.value.trim();

  if (!path) {
    alert("Please provide an absolute path to a folder.");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, collection }),
    });

    if (response.ok) {
      ingestPathInput.value = "";
      fetchQueueState();
      remoteLog(`Job enqueued: ${path}`, "INFO", "QUEUE");
    } else {
      const data = await response.json();
      throw new Error(data.error || "Failed to enqueue job");
    }
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
}

/**
 * Initialize Dashboard
 */
async function init() {
  try {
    const res = await fetch(`${API_URL}/models`);
    const data = await res.json();

    if (data.models) {
      // Filter out embedding models to prevent chat errors
      const chatModels = data.models.filter((m) => !m.name.includes("embed"));

      modelSelect.innerHTML = chatModels
        .map(
          (m) =>
            `<option value="${m.name}">${m.name} (${(m.size / 1024 / 1024 / 1024).toFixed(1)} GB)</option>`,
        )
        .join("");

      statusIndicator.innerText = "System Online";
      statusIndicator.className = "status-indicator status-online";
      sendBtn.disabled = false;
      remoteLog("Frontend connected and systems online", "SUCCESS", "SESSION");
    }

    // Initial Index Fetch
    fetchIndexMetrics();
    // Periodic Index Check (20s)
    setInterval(fetchIndexMetrics, 20000);
    // Periodic Queue Check (5s)
    setInterval(fetchQueueState, 5000);
    fetchQueueState();
  } catch (err) {
    statusIndicator.innerText = "Ollama Offline";
    statusIndicator.className = "status-indicator status-offline";
    console.error("Initialization failed:", err);
    remoteLog(`Frontend init failed: ${err.message}`, "ERROR", "SESSION");
  }
}

/**
 * Add a message to the UI
 * @returns {HTMLElement} The content container
 */
function addMessage(role, content = "") {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${role}-message glass`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "content";
  contentDiv.innerHTML =
    role === "ai"
      ? `<h3>AI Assistant</h3><p>${content}</p>`
      : `<p>${content}</p>`;

  msgDiv.appendChild(contentDiv);
  chatWindow.appendChild(msgDiv);

  // Smooth scroll to bottom
  chatWindow.scrollTop = chatWindow.scrollHeight;

  return contentDiv.querySelector("p");
}

/**
 * Run Chat Query
 */
async function handleSend() {
  const text = userInput.value.trim();
  if (!text || isGenerating) return;

  // Reset and Disable
  userInput.value = "";
  userInput.style.height = "auto";
  isGenerating = true;
  sendBtn.disabled = true;

  // Update History
  chatHistory.push({ role: "user", content: text });
  addMessage("user", text);

  // Create AI Placeholder
  const aiContentPara = addMessage("ai", "...");
  let fullResponse = "";

  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: chatHistory,
        model: modelSelect.value,
        collection: collectionInput.value,
      }),
    });

    if (!response.ok) throw new Error(`Server returned ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Step Indicator for Transparency
    const stepIndicator = document.createElement("div");
    stepIndicator.className = "thinking-status";
    stepIndicator.innerHTML =
      '<span class="status-spinner"></span> <span class="status-text">Backend Handshake...</span>';
    aiContentPara.parentElement.prepend(stepIndicator);

    aiContentPara.innerText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(t.slice(6));
          if (data.type === "metadata") {
            renderCitations(
              aiContentPara.parentElement.parentElement,
              data.citations,
            );
          } else if (data.type === "status") {
            const statusText = stepIndicator.querySelector(".status-text");
            if (data.message) {
              statusText.innerText = data.message;
            } else {
              stepIndicator.remove(); // Generation started, remove indicator
            }
          } else if (data.message && data.message.content) {
            fullResponse += data.message.content;
            aiContentPara.innerText = fullResponse;
            chatWindow.scrollTop = chatWindow.scrollHeight;
          } else if (data.error) {
            throw new Error(data.details || data.error);
          }
        } catch (e) {
          if (t.includes('{"model":')) continue; // Partial JSON chunk
          console.error("[Stream Parse Error]:", e, "Line:", t);
        }
      }
    }
    chatHistory.push({ role: "assistant", content: fullResponse });
  } catch (err) {
    aiContentPara.innerHTML = `<div class="error-badge">⚠️ Error</div><div class="status-offline">${err.message}</div>`;
    remoteLog(`Chat failed: ${err.message}`, "ERROR", "CHAT");
  } finally {
    isGenerating = false;
    sendBtn.disabled = false;
  }
}

/**
 * Render Citation Badges
 */
function renderCitations(messageElement, citations) {
  if (!citations || citations.length === 0) return;

  const citationsDiv = document.createElement("div");
  citationsDiv.className = "citations";

  citations.forEach((c) => {
    const card = document.createElement("div");
    card.className = "citation-card";

    // XSS Prevention: Build DOM manually instead of innerHTML
    const iconSpan = document.createElement("span");
    iconSpan.className = "icon";
    iconSpan.textContent = "📖 ";

    const fileText = document.createTextNode(` ${c.file} `);

    const scoreSmall = document.createElement("small");
    scoreSmall.textContent = `(${(c.score * 100).toFixed(0)}%)`;

    card.appendChild(iconSpan);
    card.appendChild(fileText);
    card.appendChild(scoreSmall);

    citationsDiv.appendChild(card);
  });

  messageElement.querySelector(".content").appendChild(citationsDiv);
}

// Event Listeners
sendBtn.addEventListener("click", handleSend);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

// Auto-expand textarea
userInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
});

clearBtn.addEventListener("click", () => {
  chatHistory = [];
  chatWindow.innerHTML = "";
  const welcome = addMessage(
    "ai",
    "Session cleared. How can I help you today?",
  );
  welcome.parentElement.querySelector("h3").innerText = "System";
});

// Startup
init();

/**
 * Fetch and Render Vector Index Metrics
 */
async function fetchIndexMetrics() {
  try {
    const response = await fetch(`${API_URL}/index/metrics`);
    if (!response.ok) throw new Error("Metrics fetch failed");
    const data = await response.json();
    renderIndexMonitor(data);
  } catch (e) {
    console.error("[Index Monitor Error]", e);
  }
}

function renderIndexMonitor(metrics) {
  if (!metrics || metrics.length === 0) {
    indexMonitor.innerHTML =
      '<div class="monitor-empty">No indices found</div>';
    return;
  }

  indexMonitor.innerHTML = metrics
    .map(
      (m) => `
    <div class="monitor-item">
      <div class="monitor-header">
        <span class="monitor-name" title="${m.name}">${m.name}</span>
        <span class="monitor-health ${m.health === "CORRUPT" ? "corrupt" : ""}">${
          m.health
        }</span>
      </div>
      <div class="monitor-stats">
        <span>🔢 ${m.vectorCount.toLocaleString()} Items</span>
        <span>📏 ${m.dimension}d</span>
        <span>💾 ${(m.totalSizeBytes / 1024).toFixed(1)} KB</span>
        <span>🧠 ${(m.estimatedMemoryFootprintBytes / 1024).toFixed(1)} KB RAM</span>
      </div>
    </div>
  `,
    )
    .join("");
}

/**
 * Fetch and Render Ingestion Queue
 */
async function fetchQueueState() {
  try {
    const response = await fetch(`${API_URL}/queue`);
    if (!response.ok) throw new Error("Queue fetch failed");
    const data = await response.json();
    renderQueueManager(data);
  } catch (e) {
    console.error("[Queue Monitor Error]", e);
  }
}

async function cancelJob(id) {
  try {
    const res = await fetch(`${API_URL}/queue/${id}`, { method: "DELETE" });
    if (res.ok) {
      fetchQueueState();
    } else {
      const data = await res.json();
      alert(data.error);
    }
  } catch (e) {
    console.error("[Cancel Job Error]", e);
  }
}

function renderQueueManager(jobs) {
  if (!jobs || jobs.length === 0) {
    queueManager.innerHTML = '<div class="queue-empty">Queue is empty</div>';
    return;
  }

  // Sort: Processing first, then Pending, then others, sub-sort by addedAt
  const sorted = [...jobs].sort((a, b) => {
    const order = {
      processing: 0,
      pending: 1,
      completed: 2,
      failed: 3,
      cancelled: 4,
    };
    if (order[a.status] !== order[b.status])
      return order[a.status] - order[b.status];
    return new Date(b.addedAt) - new Date(a.addedAt);
  });

  queueManager.innerHTML = sorted
    .map(
      (j) => `
    <div class="queue-item ${j.status}">
      <div class="queue-header">
        <span>Job #${j.id.slice(-4)}</span>
        <span class="monitor-health ${j.status}">${j.status.toUpperCase()}</span>
      </div>
      <div class="queue-path" title="${j.path}">${j.path}</div>
      <div class="queue-status">
        <span>${j.progress}</span>
        ${j.status === "pending" ? `<span class="queue-cancel" onclick="window.cancelJob('${j.id}')">✖</span>` : ""}
      </div>
    </div>
  `,
    )
    .join("");
}

// Expose cancelJob to window for onclick
window.cancelJob = cancelJob;
