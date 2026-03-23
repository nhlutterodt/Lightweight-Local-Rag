---
doc_state: canonical
doc_owner: maintainers
canonical_ref: docs/RAG_Copilot_Instructions.md
last_reviewed: 2026-03-18
audience: engineering
---
# RAG Pipeline — Copilot Instructions

## Project Overview

A Node.js-owned local RAG (Retrieval-Augmented Generation) runtime with PowerShell utility and standalone tooling.
Core flow: Queue → Ingest → Embed (Ollama) → Store (LanceDB + metadata) → Query → Ground → Generate.

Current retrieval runtime is Node.js + LanceDB with explicit retrieval modes:

1. `vector`: pure embedding retrieval.
2. `filtered-vector`: embedding retrieval with metadata constraints and boosts.
3. `hybrid`: embedding + lexical fusion.
4. `semantic`: alias of `hybrid`.

Use this terminology consistently in all docs and API contracts.

## Tech Stack

- **PowerShell 7+ (pwsh):** utility layer, standalone tooling, XML diagnostics, and offline maintenance workflows
- **Node.js 18+ (ESM):** HTTP server, hot query path, live ingestion queue, chunking, logging, and LanceDB writes
- **C# (Add-Type inline):** `VectorMath.ps1` accelerator — cosine similarity, TopK sort
  (used by PowerShell ingestion path only — not in the Node.js hot path)
- **Ollama:** local LLM and embedding model server (`config.RAG.OllamaUrl`)
- **Vector store:** LanceDB local embedded table files with metadata columns

## Key Files

### Node.js (hot path — do not introduce PowerShell here)

| File | Responsibility |
| --- | --- |
| `server.js` | Express HTTP API, VectorStore boot, QueryLogger, SSE streaming |
| `lib/vectorStore.js` | LanceDB retrieval wrapper with normalized score contract and retrieval modes |
| `lib/ollamaClient.js` | Native fetch wrappers for Ollama embed + chat stream APIs |
| `lib/queryLogger.js` | JSONL append logger, fire-and-forget, graceful flush on shutdown |
| `IngestionQueue.js` | FIFO queue with persistence and interrupted-job recovery |
| `lib/configLoader.js` | Parses `config/project-config.psd1`; applies env-var overrides; exposes `config.RAG.*` |
| `lib/documentParser.js` | Manifest read/write, `schemaVersion` migrations, SHA256 change detection |
| `lib/smartChunker.js` | JS-native chunker dispatching by file type; emits `SmartChunk` objects with metadata |
| `lib/integrityCheck.js` | Diffs manifest vs. LanceDB table; reports MISSING_VECTORS, ORPHANED_VECTORS, MODEL_MISMATCH |
| `lib/modelMigration.js` | Triggers full re-embedding queue when `EmbeddingModel` changes between restarts |
| `lib/snapshotManager.js` | LanceDB version list / rollback / prune via `checkout()` + `restore()` sequence |

### PowerShell (utility and standalone tools — do not move live ingestion ownership back here)

| File | Responsibility |
| --- | --- |
| `Ingest-Documents.ps1` | Standalone ingestion utility and compatibility path, not the live queue-owned runtime |
| `SmartTextChunker.ps1` | `DispatchByExtension()`, sliding-window overlap, `FindSentenceBoundary()` |
| `TextChunker.ps1` | Base chunker with wired overlap |
| `VectorStore.ps1` | Binary format read/write including model-name header |
| `VectorMath.ps1` | C# cosine similarity + TopK (ingestion path only) |
| `OllamaClient.ps1` | HTTP wrapper for Ollama embed API (ingestion only) |
| `Query-Rag.ps1` | Standalone CLI query tool (not used by Node.js hot path) |
| `Chat-Rag.ps1` | Standalone CLI chat tool (not used by Node.js hot path) |
| `SourceManifest.ps1` | SHA256 change detection, rename handling, orphan cleanup |
| `Get-VectorMetrics.ps1` | Store health metrics including chunk stats and model name |
| `project-config.psd1` | Single source of truth for all tunable RAG values |

## Hot Path (Node.js only — no pwsh spawned)

```text
POST /api/chat
  → lib/ollamaClient.embed()        # native fetch → Ollama /api/embeddings
  → lib/vectorStore.findNearest()   # LanceDB vector retrieval (+ filtered/hybrid options)
  → structured [CHUNK] context      # chunkId/sourceId/locatorType annotated prompt blocks
  → event: metadata SSE             # preview + score + source metadata to client
  → lib/ollamaClient.chatStream()   # native fetch, SSE token stream to client
  → event: answer_references SSE    # final normalized grounding references
  → optional grounding_warning SSE  # deterministic no-approved-context signal
  → lib/queryLogger.log()           # fire-and-forget JSONL append, zero latency impact
```

## Ingestion Path (Node queue + JS chunking)

```text
POST /api/queue
  → IngestionQueue.js
  → SmartTextChunker.dispatchByExtension() in Node.js
  → lib/ollamaClient.embed() for vector generation
  → LanceDB table writes via lib/vectorStore.js compatible records
  → server.js hot-reloads store on completion
```

## Retrieval Terminology Contract

This project uses the following canonical retrieval terms:

1. Vector search: nearest-neighbor retrieval from embeddings only.
2. Filtered-vector search: vector search constrained and reranked by metadata fields (`FileName`, `FileType`, `HeaderContext`).
3. Hybrid search: vector relevance fused with lexical match evidence over retrieved chunk text and metadata.
4. Semantic search: reserved alias of `hybrid`; do not use as a synonym for pure vector search.

## Chunk Row Metadata (LanceDB row schema)

Per-row metadata fields consumed by the hot path:

- `ChunkText` / `TextPreview` — full context and citation preview
- `SourceId`, `ChunkHash`, `chunkOrdinal` — provenance identity fields
- `FileName`, `HeaderContext`, `LocatorType`, `SectionPath`, `SymbolName` — source attribution fields
- `PageStart`, `PageEnd` — optional page-range attribution fields for structured PDF chunks only
- `EmbeddingModel`, `IngestedAt` — compatibility and telemetry fields
  Do not remove or rename these fields without synchronized migration updates.

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

## Query Logging — `logs/query_log.v1.jsonl`

Every `/api/chat` request appends one JSONL entry. Schema:

```json
{
  "timestamp": "ISO-8601",
  "query": "truncated to 500 chars",
  "scoreSchemaVersion": "v1",
  "scoreType": "normalized-relevance",
  "embeddingModel": "nomic-embed-text",
  "chatModel": "llama3.1:8b",
  "topK": 5,
  "minScore": 0.003,
  "resultCount": 3,
  "lowConfidence": false,
  "retrievedCandidates": [
    {
      "score": 0.847,
      "chunkId": "chk_deadbeef12345678",
      "sourceId": "src_1234567890abcdef",
      "fileName": "...",
      "locatorType": "section",
      "sectionPath": "Guide > Install",
      "symbolName": "Get-Thing",
      "headerContext": "...",
      "preview": "..."
    }
  ],
  "approvedContext": [],
  "droppedCandidates": [],
  "answerReferences": []
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

1. Compare current code against those documents before proposing changes.
2. Update canonical docs in the same change set when implementation status shifts.
3. Keep terminology stable across docs and code (`Phase A/B/C/D`, reducer-driven chat lifecycle, stable IDs).
4. Preserve accessibility and async-state guarantees as non-negotiable regression constraints.

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
- `IngestionQueue.js` queue persistence, migration guards, and interrupted-job recovery

## Deferred — Finding #3 (Vector Index Pre-filtering)

Brute-force O(n) scan is acceptable at current scale (<10K vectors).
Revisit when `Get-VectorMetrics.ps1` reports `ChunkCount` approaching 10,000.
At that point, add metadata-based pre-filtering in `lib/vectorStore.js` before the
cosine similarity loop — no PowerShell changes required.
