# LanceDB Integration Assessment

## Executive Summary

This document assesses the transition from our custom in-memory `.vectors.bin` flat-file vector store to **LanceDB**, an embedded, serverless vector database. This transition aims to solve the upcoming dataset scaling ceiling (10k+ vectors) while rigorously preserving our "Local, Offline, Zero-Background-Server" architectural mandate.

---

## 1. What is LanceDB? (The Authoritative Context)

Based on current authoritative documentation, LanceDB is a developer-friendly, serverless local vector database built specifically for AI workloads.

**Key Characteristics:**

- **Zero-Config, In-Process:** Like SQLite, it runs entirely inside the host process (our Node.js bridge server). It does not require spinning up Docker containers or background ports like Chroma, Pinecone, or Milvus.
- **Disk-Based Indexing (IVF-PQ / HNSW):** It uses the Apache Arrow columnar format. Instead of loading the entire dataset into RAM (our current bottleneck), it streams disk reads with sub-millisecond latencies, supporting billions of vectors natively.
- **Unified Storage:** It stores both the vector embeddings and the structured metadata (`ChunkText`, `FileName`, `HeaderContext`) in the same table, eliminating our split `.bin` and `.metadata.json` architecture.
- **Native JavaScript SDK:** It provides a fully typed `@lancedb/lancedb` package for Node.js.

### Known Limitations & Tradeoffs

- **Binary Compatibility:** Because it relies on heavily optimized Rust/C++ binaries, it can sometimes struggle on minimal Docker environments (like Alpine Linux). _Mitigation:_ We are running natively on Windows desktop environments, rendering this a non-issue.
- **Write Concurrency:** It handles massive parallel reads, but concurrent _write_ operations can occasionally bottleneck. _Mitigation:_ Our ingestion pipeline is strictly sequential via `IngestionQueue.js`, meaning we naturally avoid write-contention.

---

## 2. The "Blast Radius" (Ripple Effects)

Replacing a foundational storage layer impacts both the read (chat) and write (ingestion) pipelines. The blast radius is tightly contained to the `VectorStore` boundaries, but changes the orchestration between PowerShell and Node.js.

### A. The Data Write Path (Ingestion)

**Current:** `Ingest-Documents.ps1` processes text, calls Ollama, and directly writes `Collection.vectors.bin` and `Collection.metadata.json` to disk using custom binary packing methods (`VectorStore.ps1`).

**Post-LanceDB:**
Since the `@lancedb/lancedb` SDK runs native in Node.js, we must shift database write authority from PowerShell to Node.

1. **PowerShell's New Role:** PowerShell will ONLY handle crawling, hashing, and smart text chunking. It will stream a standard JSON array (`[ { vector: [...], text: "...", metadata: {...} } ]`) to Node.js.
2. **Node.js's New Role:** The `IngestionQueue.js` will intercept this JSON and execute `table.add(records)` into LanceDB.
3. **Ripple Effect:** The legacy `VectorStore.ps1` binary writer will be deleted entirely.

### B. The Hot Query Path (Chat)

**Current:** `lib/vectorStore.js` reads the `.bin` file into a `Float32Array` on server boot, and computes linear math (`findNearest()`) manually using CPU cycles.

**Post-LanceDB:**

1. **Node.js's New Role:** `lib/vectorStore.js` is rewritten to wrap the LanceDB SDK. Instead of manual math, it executes:
   ```javascript
   const results = await table.search(queryVector).limit(5).execute();
   ```
2. **Ripple Effect:** Memory footprint plummets. We no longer need to implement complex "hot-reload" file system watchers, as LanceDB manages read/write state natively.

### C. File System Changes

**Current:**

- `Data/TestIngest.vectors.bin`
- `Data/TestIngest.metadata.json`

**Post-LanceDB:**

- `Data/TestIngest.lance/` (A specialized directory managed by LanceDB containing Arrow files).

---

## 3. Structural Alignment

Does LanceDB fit our project? **Yes, perfectly.**

| Mandate                     | Status | Justification                                            |
| :-------------------------- | :----: | :------------------------------------------------------- |
| **100% Offline**            |   ✅   | No internet required. Built on Apache Arrow.             |
| **Zero Background Servers** |   ✅   | Runs perfectly inside our existing Express.js process.   |
| **No Docker/Python**        |   ✅   | Native dependency via `npm install @lancedb/lancedb`.    |
| **Scale > 100k Vectors**    |   ✅   | Handles tens of millions of rows easily via disk-paging. |

---

## 4. Proposed Migration Plan

If approved, the migration will follow extreme defensive programming practices to avoid disrupting the working state.

1. **Install SDK:** `npm install @lancedb/lancedb` in the `gui/server` directory.
2. **Rewrite the Read Path:** Update `lib/vectorStore.js` to initialize and search LanceDB.
3. **Rewrite the Write Path:** Update `Ingest-Documents.ps1` to stop writing `.bin` files and instead export a structured JSON file per batch.
4. **Update the Queue:** Update `IngestionQueue.js` to read those batch files and call `table.add()`.
5. **Delete Legacy Code:** Purge `VectorStore.ps1` and the `.bin` format parsing logic securely.
