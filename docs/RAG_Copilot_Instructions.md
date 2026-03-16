---
doc_state: canonical
doc_owner: maintainers
canonical_ref: docs/RAG_Copilot_Instructions.md
last_reviewed: 2026-03-15
audience: engineering
---
# RAG Pipeline — Copilot Instructions

## Project Overview

A PowerShell + Node.js RAG (Retrieval-Augmented Generation) pipeline.
Core flow: Ingest → Embed (Ollama) → Store (LanceDB + metadata) → Query → Augment → Generate.

Current retrieval runtime is Node.js + LanceDB with explicit retrieval modes:

1. `vector`: pure embedding retrieval.
2. `filtered-vector`: embedding retrieval with metadata constraints and boosts.
3. `hybrid`: embedding + lexical fusion.
4. `semantic`: alias of `hybrid`.

Use this terminology consistently in all docs and API contracts.

## Tech Stack

- **PowerShell 7+ (pwsh):** ingestion pipeline only — chunking, embedding, vector store writes
- **Node.js 18+ (ESM):** HTTP server, hot query path, logging, ingestion queue
- **C# (Add-Type inline):** `VectorMath.ps1` accelerator — cosine similarity, TopK sort
  (used by PowerShell ingestion path only — not in the Node.js hot path)
- **Ollama:** local LLM and embedding model server (`config.RAG.OllamaUrl`)
- **Vector store:** LanceDB local embedded table files with metadata columns

## Key Files

### Node.js (hot path — do not introduce PowerShell here)

| File                  | Responsibility                                                   |
| --------------------- | ---------------------------------------------------------------- |
| `server.js`           | Express HTTP API, VectorStore boot, QueryLogger, SSE streaming   |
| `lib/vectorStore.js`  | LanceDB retrieval wrapper with normalized score contract and retrieval modes |
| `lib/ollamaClient.js` | Native fetch wrappers for Ollama embed + chat stream APIs        |
| `lib/queryLogger.js`  | JSONL append logger, fire-and-forget, graceful flush on shutdown |
| `IngestionQueue.js`   | FIFO queue with persistence and interrupted-job recovery         |
| `PowerShellRunner.js` | Process spawning, JSON stream parsing, shell-injection guard     |
| `lib/configLoader.js`       | Parses `config/project-config.psd1`; applies env-var overrides; exposes `config.RAG.*` |
| `lib/documentParser.js`     | Manifest read/write, `schemaVersion` migrations, SHA256 change detection |
| `lib/smartChunker.js`       | JS-native chunker dispatching by file type; emits `SmartChunk` objects with metadata |
| `lib/integrityCheck.js`     | Diffs manifest vs. LanceDB table; reports MISSING_VECTORS, ORPHANED_VECTORS, MODEL_MISMATCH |
| `lib/modelMigration.js`     | Triggers full re-embedding queue when `EmbeddingModel` changes between restarts |
| `lib/snapshotManager.js`    | LanceDB version list / rollback / prune via `checkout()` + `restore()` sequence |

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
  → lib/vectorStore.findNearest()   # LanceDB vector retrieval (+ filtered/hybrid options)
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

## Retrieval Terminology Contract

This project uses the following canonical retrieval terms:

1. Vector search: nearest-neighbor retrieval from embeddings only.
2. Filtered-vector search: vector search constrained and reranked by metadata fields (`FileName`, `FileType`, `HeaderContext`).
3. Hybrid search: vector relevance fused with lexical match evidence over retrieved chunk text and metadata.
4. Semantic search: reserved alias of `hybrid`; do not use as a synonym for pure vector search.

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
    MinScore         = 0.003
    MaxContextTokens = 2048
    CollectionName   = "TestIngestNodeFinal"   # validated /^[a-zA-Z0-9_-]+$/ on boot
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
  "minScore": 0.003,
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

`score` is a normalized higher-is-better relevance value derived from LanceDB distance.
`resultCount` counts the results that survive thresholding and context-budget enforcement.
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

## Frontend UI/UX Agent Workflow (Required)

When an AI agent is asked to perform UI/UX analysis or implementation in
`gui/client/react-client`, follow this deterministic workflow:

1. Search for canonical docs first, in this order:
  - `docs/UI_UX_Analysis.md`
  - `docs/UI_UX_Frontend_Implementation_Plan.md`
  - `docs/Roadmap.md`
2. Compare current code against those documents before proposing changes.
3. Update canonical docs in the same change set when implementation status shifts.
4. Keep terminology stable across docs and code (`Phase A/B/C/D`, reducer-driven chat lifecycle, stable IDs).
5. Preserve accessibility and async-state guarantees as non-negotiable regression constraints.

### Frontend Guardrails for Agents

- Prefer class-based CSS over inline presentational styles.
- Keep chat message identity stable (`message.id`) and queue identity stable (`entityId`).
- Do not bypass the chat reducer contract in `src/state/chatStateMachine.js`.
- Keep sanitization in place for AI-rendered content.
- Do not introduce breaking changes to the API/SSE contracts without corresponding doc updates.

### Frontend Validation Commands

Before finalizing UI/UX work, run from `gui/client/react-client`:

```powershell
npm test
```

Before finalizing docs-focused changes, run from repo root:

```powershell
pwsh ./scripts/Validate-Docs.ps1
```

Treat failures in either command as blockers.

## Do Not Change Without Coordination

- `lib/documentParser.js` manifest schema — `schemaVersion` field and `MANIFEST_MIGRATIONS` table must be extended when new manifest fields are added
- `IngestionQueue.js` queue schema — `schemaVersion` field and queue migration steps must be extended in sync
- `VectorMath.ps1` C# accelerator — correct and performant, not part of the hot path
- `SourceManifest.ps1` change detection and orphan cleanup logic
- `IngestionQueue.js` FIFO persistence and interrupted-job recovery
- `PowerShellRunner.js` process spawning and JSON stream parsing

## Deferred — Finding #3 (Vector Index Pre-filtering)

Brute-force O(n) scan is acceptable at current scale (<10K vectors).
Revisit when `Get-VectorMetrics.ps1` reports `ChunkCount` approaching 10,000.
At that point, add metadata-based pre-filtering in `lib/vectorStore.js` before the
cosine similarity loop — no PowerShell changes required.

