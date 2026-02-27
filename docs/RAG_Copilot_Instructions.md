# RAG Pipeline — Copilot Instructions

## Project Overview

A PowerShell + Node.js RAG (Retrieval-Augmented Generation) pipeline.
Core flow: Ingest → Embed (Ollama) → Store (binary VectorStore) → Query → Augment → Generate.
All P0, P1, and P2 findings from the 2026-02-27 backend audit are resolved.
Finding #3 (vector index pre-filtering) is intentionally deferred — revisit at >10K vectors.

## Tech Stack

- **PowerShell 7+ (pwsh):** ingestion pipeline only — chunking, embedding, vector store writes
- **Node.js 18+ (ESM):** HTTP server, hot query path, logging, ingestion queue
- **C# (Add-Type inline):** `VectorMath.ps1` accelerator — cosine similarity, TopK sort
  (used by PowerShell ingestion path only — not in the Node.js hot path)
- **Ollama:** local LLM and embedding model server (`config.RAG.OllamaUrl`)
- **Binary format:** `.vectors.bin` + `.metadata.json` — no SQLite, no external vector DB

## Key Files

### Node.js (hot path — do not introduce PowerShell here)

| File                  | Responsibility                                                   |
| --------------------- | ---------------------------------------------------------------- |
| `server.js`           | Express HTTP API, VectorStore boot, QueryLogger, SSE streaming   |
| `lib/vectorStore.js`  | Binary `.vectors.bin` reader, in-memory cosine similarity, TopK  |
| `lib/ollamaClient.js` | Native fetch wrappers for Ollama embed + chat stream APIs        |
| `lib/queryLogger.js`  | JSONL append logger, fire-and-forget, graceful flush on shutdown |
| `IngestionQueue.js`   | FIFO queue with persistence and interrupted-job recovery         |
| `PowerShellRunner.js` | Process spawning, JSON stream parsing, shell-injection guard     |

### PowerShell (ingestion path — do not move to Node.js)

| File                    | Responsibility                                                            |
| ----------------------- | ------------------------------------------------------------------------- |
| `Ingest-Documents.ps1`  | Ingestion entry point, config loading, VectorStore hydration              |
| `SmartTextChunker.ps1`  | `DispatchByExtension()`, sliding-window overlap, `FindSentenceBoundary()` |
| `TextChunker.ps1`       | Base chunker with wired overlap                                           |
| `VectorStore.ps1`       | Binary format read/write including model-name header                      |
| `VectorMath.ps1`        | C# cosine similarity + TopK (ingestion path only)                         |
| `OllamaClient.ps1`      | HTTP wrapper for Ollama embed API (ingestion only)                        |
| `Query-Rag.ps1`         | Standalone CLI query tool (not used by Node.js hot path)                  |
| `Chat-Rag.ps1`          | Standalone CLI chat tool (not used by Node.js hot path)                   |
| `SourceManifest.ps1`    | SHA256 change detection, rename handling, orphan cleanup                  |
| `Get-VectorMetrics.ps1` | Store health metrics including chunk stats and model name                 |
| `project-config.psd1`   | Single source of truth for all tunable RAG values                         |

## Hot Path (Node.js only — no pwsh spawned)

```
POST /api/chat
  → lib/ollamaClient.embed()        # native fetch → Ollama /api/embeddings
  → lib/vectorStore.findNearest()   # Float32Array cosine similarity, in-memory
  → context from ChunkText          # full chunk content, not TextPreview
  → event: citations SSE            # TextPreview + score + source metadata to client
  → lib/ollamaClient.chatStream()   # native fetch, SSE token stream to client
  → lib/queryLogger.log()           # fire-and-forget JSONL append, zero latency impact
```

## Ingestion Path (PowerShell — no Node.js logic here)

```
POST /api/ingest
  → IngestionQueue.js
  → PowerShellRunner.js → Ingest-Documents.ps1
  → SmartTextChunker.DispatchByExtension()
  → OllamaClient.ps1 → VectorStore.ps1 → .vectors.bin + .metadata.json
  → server.js hot-reloads store on completion
```

## Binary Format — `.vectors.bin`

Both `VectorStore.ps1` and `lib/vectorStore.js` implement this layout and must stay in sync:

```
[int32 count][int32 dims][int32 modelNameByteLength][utf8 bytes × modelNameByteLength][float32 × count × dims]
```

Legacy detection: if `modelNameByteLength` is outside `1–256`, treat as legacy format
(no model header), seek back 4 bytes, set model = null, emit a warning.
**Any change to this layout requires coordinated updates to both readers.**

## Metadata Format — `.metadata.json`

Array of objects. Key fields consumed by the hot path:

- `ChunkText` — full chunk content, used for RAG grounding (added P0)
- `TextPreview` — first 100 chars, used for citations and query logs only
- `FileName`, `ChunkIndex`, `HeaderContext` — source attribution
- `IngestedAt` — timestamp, used by `Get-VectorMetrics.ps1`
  Do not remove or rename these fields.

## Configuration — `project-config.psd1`

All tunable values live in the `RAG` block. No hardcoded values anywhere in the codebase:

```powershell
RAG = @{
    OllamaUrl        = "http://localhost:11434"
    EmbeddingModel   = "nomic-embed-text"
    ChatModel        = "llama3.1:8b"
    ChunkSize        = 1000
    ChunkOverlap     = 200
    TopK             = 5
    MinScore         = 0.5
    MaxContextTokens = 2048
}
```

- PowerShell scripts load this via the project config loader after the `param()` block
- Node.js reads it via `loadProjectConfig()` in `server.js` — `config.RAG.*`
- CLI parameter overrides still work — config sets defaults, args override them

## Query Logging — `logs/query_log.jsonl`

Every `/api/chat` request appends one JSONL entry. Schema:

```json
{
  "timestamp": "ISO-8601",
  "query": "truncated to 500 chars",
  "embeddingModel": "nomic-embed-text",
  "chatModel": "llama3.1:8b",
  "topK": 5,
  "minScore": 0.5,
  "resultCount": 3,
  "lowConfidence": false,
  "results": [
    {
      "score": 0.847,
      "fileName": "...",
      "chunkIndex": 2,
      "headerContext": "...",
      "preview": "..."
    }
  ]
}
```

`lowConfidence: true` when `resultCount === 0` or top score < `MinScore + 0.1`.
Log writes are fire-and-forget — never awaited in the request path.

## Coding Standards

- **PowerShell:** `[CmdletBinding()]`, `$ErrorActionPreference = 'Stop'`, named param blocks
- **Node.js:** ESM (`import`/`export`), async/await, no CommonJS `require`
- **Dependencies:** `lib/vectorStore.js`, `lib/ollamaClient.js`, `lib/queryLogger.js`
  have zero npm dependencies — Node 18+ built-ins only
- **Error handling:** fail fast with descriptive messages referencing the relevant
  config key or file path — never swallow exceptions silently
- **Config:** always `config.RAG.*` in Node.js, `$Config.RAG.*` in PowerShell —
  never hardcode model names, URLs, or thresholds

## Do Not Change Without Coordination

- `.vectors.bin` binary layout — JS and PS readers must stay in sync
- `VectorMath.ps1` C# accelerator — correct and performant, not part of the hot path
- `SourceManifest.ps1` change detection and orphan cleanup logic
- `IngestionQueue.js` FIFO persistence and interrupted-job recovery
- `PowerShellRunner.js` process spawning and JSON stream parsing

## Deferred — Finding #3 (Vector Index Pre-filtering)

Brute-force O(n) scan is acceptable at current scale (<10K vectors).
Revisit when `Get-VectorMetrics.ps1` reports `ChunkCount` approaching 10,000.
At that point, add metadata-based pre-filtering in `lib/vectorStore.js` before the
cosine similarity loop — no PowerShell changes required.
