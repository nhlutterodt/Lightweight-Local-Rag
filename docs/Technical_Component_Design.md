---
doc_state: canonical
doc_owner: backend
canonical_ref: docs/Technical_Component_Design.md
last_reviewed: 2026-03-15
audience: engineering
---
# Technical Design Components

This document deep-dives into the current RAG runtime: LanceDB retrieval, corpus-aware chunking, ingestion queue behavior, and SSE contracts.

---

## 1. VectorStore: LanceDB Retrieval Runtime

The current query hot path uses LanceDB tables as the local embedded vector store.

### Retrieval Modes

1. Vector: embedding relevance only.
2. Filtered Vector: vector relevance with metadata constraints and metadata boosts.
3. Hybrid: weighted fusion of vector relevance and lexical evidence.
4. Semantic: API alias of Hybrid.

### Score Contract

LanceDB returns distance values. Runtime converts distance to normalized relevance before thresholding and emission:

$$relevance = \frac{1}{1 + max(0, distance)}$$

This value is the citation `score`, query log `score`, and threshold input (`MinScore`) to keep behavior deterministic.

### Metadata Signals Used at Query-Time

1. `FileName`
2. `FileType`
3. `HeaderContext`
4. `ChunkType`
5. `StructuralPath`

Filtered-vector mode uses these for constraints and boosts. Hybrid mode additionally evaluates lexical overlap over text and metadata fields.

---

## 2. Smart Chunking

Historically, uniform character splits caused noisy context and boundary breakage. The current chunker dispatches by file type and emits metadata-rich chunks.

### Markdown (`.md`)

1. Splits by heading sections while preserving fenced code blocks.
2. Emits section path in `HeaderContext` and `StructuralPath`.

### PowerShell Scripts (`.ps1`)

1. Splits around `param`, `function`, `class`, and `filter` boundaries.
2. Attaches declaration context for retrieval targeting.

### XML Logs (`.xml`)

1. Chunks repeated `PowerShellLog` / `LogEntry` units as first-class boundaries.
2. Falls back to element segmentation when schema-specific boundaries are unavailable.

### Sentence Fallbacks

1. If a chunk exceeds limits, it uses sentence-aware and paragraph-aware fallback boundaries.
2. Overlap preserves continuity across adjacent chunks.

---

## 3. Ingestion Queue Subsystem

The Node.js server orchestrates asynchronous ingestion through a file-backed FIFO queue. This protects local compute resources during embedding and keeps ingestion crash-resilient.

### `queue.json` Checkpointing

Instead of keeping arrays in memory (which disappear instantly on Node crashes), jobs are pushed directly to local disks:

```json
{
  "schemaVersion": 1,
  "jobs": [
    {
      "id": "job-1718223412555",
      "path": "c:/Users/Owner/documents/legal",
      "collection": "legal",
      "status": "pending",
      "createdAt": "...ISO string"
    }
  ]
}
```

The queue manager processes jobs sequentially and persists state updates to disk. On restart, interrupted jobs are recovered from persisted state.

---

## 4. Server-Sent Events (SSE) Interface Contract

Streaming responses are emitted over `text/event-stream` to keep UI updates responsive during retrieval and generation.

### Event Types

The client parses `data: <json>` events containing explicit payload types.

#### 1: Initializing (`status`)

Sent immediately while retrieval starts.

```json
// data:
{ "type": "status", "message": "Applying smart search across database..." }
```

#### 2: Routing (`metadata`)

Transmits top retrieved citations before response token streaming begins.

```json
// data:
{
  "type": "metadata",
  "citations": [
    { "fileName": "manual.md", "score": 0.8123, "preview": "..." }
  ]
}
```

#### 3: Transmitting (`message`)

Ollama token chunks stream as incremental message events.

```json
// data:
{ "message": { "content": " The" } }
```

```json
// data:
{ "message": { "content": " answer" } }
```

See the canonical contract in `docs/SSE_CONTRACT.md` for authoritative wire details.

---

## 5. Integrity Check

`lib/integrityCheck.js` diffs the JSON manifest (`DocumentParser`) against the LanceDB
table (`VectorStore`) and reports four issue types:

| Type | Description |
|------|-------------|
| `MISSING_VECTORS` | File is in the manifest but has no chunks in the DB |
| `CHUNK_COUNT_MISMATCH` | Manifest chunk count differs from actual DB row count |
| `MODEL_MISMATCH` | Chunk was embedded with a different model than currently configured |
| `ORPHANED_VECTORS` | Vectors exist in the DB but have no manifest entry |

CLI:

```
npm run check:integrity           # read-only scan; exit 0 = clean
npm run check:integrity:repair    # scan + delete orphaned vectors
```

After any `snapshot:rollback`, run `check:integrity` to assess manifest divergence.

---

## 6. Model Migration

`lib/modelMigration.js` is invoked at server boot when the configured `EmbeddingModel`
differs from the model recorded in the LanceDB table.

1. Collects unique source directories from all manifest `SourcePath` entries.
2. Calls `DocumentParser.clear()` to remove the manifest file.
3. Enqueues a re-ingest job per unique source directory via `IngestionQueue.enqueue()`.
4. Server remains up but `isReady = false`; vector search returns empty results until
   re-indexing completes and the server restarts.

Changing `EmbeddingModel` in `project-config.psd1` and restarting the server is sufficient
to trigger a full re-embedding — no manual steps required.

---

## 7. Snapshot Management

LanceDB creates a new immutable version on every write. `lib/snapshotManager.js` wraps
the native version API for three maintenance operations:

| Operation | npm script | What it does |
|-----------|-----------|--------------|
| List | `snapshot:list` | Shows all versions with timestamps and current-version marker |
| Rollback | `snapshot:rollback --to N` | `checkout(N)` → `restore()` sequence; manifest NOT modified |
| Prune | `snapshot:prune [--keep-last N]` | Calls `cleanupOldVersions(cutoff)` keeping N most recent |

**Prune cutoff:** versions sorted oldest-first; `cutoffIdx = total − keepLast`;
`cutoff = sorted[cutoffIdx].timestamp`; `cleanupOldVersions` removes `timestamp < cutoff`.

After `snapshot:rollback`, always run `npm run check:integrity` to assess manifest divergence.
