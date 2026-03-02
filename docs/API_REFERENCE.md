# Local RAG API Reference

This document outlines the available REST and Server-Sent Event (SSE) endpoints provided by the Node.js backend (`server.js`).

For the specific SSE payload contract used by the LLM inference engine, see [SSE Contract — `/api/chat`](./SSE_CONTRACT.md).

---

## 1. System & Diagnostic Endpoints

### GET `/api/health`

Executes a native PowerShell health diagnostic (`Invoke-SystemHealth.ps1`).

**Note:** This endpoint implements a 15-second localized memory cache to prevent UI polling from spawning excessive `pwsh` subprocesses.

**Response (200 OK):**

```json
{
  "Processors": ["Intel(R) Core(TM) i7..."],
  "MemoryGB": 32,
  "DiskFreeGB": 105.2,
  "PowerShellVersion": "7.4.1"
}
```

### GET `/api/models`

Fetches the current Ollama tags and cross-references them against the required models in the project configuration.

**Response (200 OK):**

```json
{
  "models": [ ... ],
  "required": {
    "embed": { "name": "nomic-embed-text", "installed": true },
    "chat": { "name": "llama3.1:8b", "installed": true }
  },
  "ready": true
}
```

### POST `/api/log`

Writes an application log using the native `Append-LogEntry.ps1` script.

**Request:**

```json
{
  "message": "User clicked settings",
  "level": "INFO",
  "category": "UI"
}
```

---

## 2. Ingestion & Queue Management

### GET `/api/browse`

Spawns a native Windows OS folder selection dialog (`Select-Folder.ps1`) and returns the parsed path.

**Response (200 OK):**

```json
{
  "path": "C:\\Users\\Example\\Documents"
}
```

### POST `/api/queue`

Enqueues a background directory ingestion job.

**Request:**

```json
{
  "path": "C:\\Users\\Example\\Documents",
  "collection": "MyDocuments"
}
```

### GET `/api/queue`

Returns the current snapshot array of pending and active ingestion jobs.

### GET `/api/queue/stream` (SSE)

Creates a Server-Sent Event stream that natively pushes an array of the queue jobs anytime the queue state changes.

**Payload Event:**

```
data: [{"id": "123", "status": "processing", "progress": 50}]
```

### DELETE `/api/queue/:id`

Cancels a pending ingestion job.

---

## 3. Vector Index Endpoints

### GET `/api/index/metrics`

Connects natively (via Node.js) to the local LanceDB directory to calculate logical chunk counts and database health. This endpoint leverages a background cache to ensure rapid dashboard rendering.

**Response (200 OK):**

```json
[
  {
    "name": "MyDocuments",
    "file": "vector_store.lance/MyDocuments",
    "vectorCount": 1542,
    "dimension": 768,
    "health": "OK",
    "EmbeddingModel": "nomic-embed-text"
  }
]
```

---

## 4. Inference Endpoints

### POST `/api/chat` (SSE)

The primary RAG inference capability. It embeds the message natively, retrieves chunks from LanceDB, enforces a pre-flight Context Token Budget (capped at ~4000 tokens) to protect Ollama's VRAM constraints, and streams the inference response.

**Recent Upgrades:**

- Concurrency Mutex on the Embedding phase prevents Ollama lockups.
- Connected an `AbortController` to gracefully halt Ollama inference generation if the HTTP request closes mid-stream.

_See [`SSE_CONTRACT.md`](./SSE_CONTRACT.md) for the wire format._

---

## Error Contracts

The server uses **RFC 7807 Problem Details** for HTTP APIs to format standard configuration/health errors.

**Example 500 Server Error:**

```json
{
  "type": "System Health Error",
  "status": 500,
  "detail": "Failed to invoke PowerShell script due to restricted execution policy."
}
```
