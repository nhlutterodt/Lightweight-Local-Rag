---
doc_state: reference-contract
doc_owner: api
canonical_ref: docs/API_REFERENCE.md
last_reviewed: 2026-03-15
audience: engineering
---
# Local RAG API Reference

This document outlines the available REST and Server-Sent Event (SSE) endpoints provided by the Node.js backend (`server.js`).

For the specific SSE payload contract used by the LLM inference engine, see [SSE Contract — `/api/chat`](./SSE_CONTRACT.md).

---

## 1. System & Diagnostic Endpoints

### GET `/api/health`

Runs a native Node.js health check that summarizes local dependency and storage readiness.

**Note:** This endpoint implements a 15-second in-memory cache to keep repeated UI polling lightweight.

**Response (200 OK):**

```json
{
  "timestamp": "2026-03-15T14:13:01.887Z",
  "status": "healthy",
  "checks": [
    {
      "name": "Ollama Service",
      "status": "OK",
      "message": "Service reachable"
    },
    {
      "name": "Vector Store",
      "status": "OK",
      "message": "Data directory exists at C:\\Users\\Owner\\Local-RAG-Project-v2\\Local-RAG-Project-v2\\PowerShell Scripts\\Data"
    },
    {
      "name": "Local Disk",
      "status": "OK",
      "message": "42.7 GB free on drive"
    }
  ]
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

Writes an application log through the Node.js bridge XML logger.

The log is appended to `PowerShell Scripts/Data/bridge-log.xml` using a minimal `PowerShellLog` XML structure.

**Request:**

```json
{
  "message": "User clicked settings",
  "level": "INFO",
  "category": "UI"
}
```

**Response (200 OK):**

```json
{
  "status": "logged"
}
```

---

## 2. Ingestion & Queue Management

### GET `/api/browse`

Returns a server-side directory listing for the requested absolute path within configured allowed roots (`ALLOWED_BROWSE_ROOTS`).

If `path` is omitted, the endpoint defaults to the first allowed root. Hidden dotfiles are filtered from the listing.

**Query Parameters:**

- `path` (optional): Absolute directory path.

**Response (200 OK):**

```json
{
  "currentPath": "C:\\Users\\Example\\RAG_Documents",
  "parentPath": "C:\\Users\\Example",
  "contents": [
    {
      "name": "ProjectDocs",
      "isDirectory": true,
      "path": "C:\\Users\\Example\\RAG_Documents\\ProjectDocs"
    }
  ]
}
```

**Error Contract:**

- `403` with `code: "BROWSE_PATH_RESTRICTED"` when path is outside policy boundaries.
- `404` with `code: "BROWSE_PATH_NOT_FOUND"` when path is missing between validation and read.
- `500` with `code: "BROWSE_READ_FAILED"` for unexpected read failures.

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

The primary RAG inference capability. It embeds the message natively, retrieves chunks from LanceDB, enforces a pre-flight Context Token Budget using `config.RAG.MaxContextTokens`, and streams the inference response.

**Request (minimum):**

```json
{
  "messages": [{ "role": "user", "content": "How does retrieval work?" }],
  "collection": "TestIngestNodeFinal"
}
```

**Request (Phase 3 retrieval mode controls):**

```json
{
  "messages": [{ "role": "user", "content": "Show PowerShell chunking in Chat-Rag.ps1" }],
  "collection": "TestIngestNodeFinal",
  "retrievalMode": "filtered-vector",
  "retrievalConstraints": {
    "fileType": "powershell",
    "fileName": "Chat-Rag.ps1",
    "headerContext": "Chunking",
    "strict": true
  }
}
```

`retrievalMode` accepts:

1. `vector` (default): pure embedding relevance ranking.
2. `filtered-vector`: embedding ranking with optional metadata constraints and boosts.
3. `hybrid`: weighted fusion of embedding relevance and lightweight lexical evidence.
4. `semantic`: alias of `hybrid` for API compatibility.

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
  "detail": "connect ECONNREFUSED 127.0.0.1:11434"
}
```

