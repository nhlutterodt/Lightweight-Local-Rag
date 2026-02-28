# Local RAG Project — Roadmap

This document outlines the trajectory for the Local RAG ecosystem, categorized by immediate practical feature enhancements and long-term aspirational goals.

---

## Part 1: Practical Features (Short to Medium Term)

These features represent the immediate next steps to enrich the current UI architecture without breaking the established P0/P1 stability thresholds.

### 1. Advanced Metadata Expositions (UI)

- **Goal:** Surface the `HeaderContext` and `Token Count` metadata directly to the user during a chat response.
- **Implementation:** Modify the JavaScript client to render floating citation markers. Clicking a marker will open a side-panel displaying the exact source document path, the nearest heading the chunk belongs to, and the raw markdown.

### 2. Multi-Collection Interrogation

- **Goal:** Allow users to query multiple collections simultaneously (e.g., searching across `Research_Papers` and `Code_Snippets` in one prompt).
- **Implementation:** Expand the `VectorStore.ps1` binary layout to allow aggregate mappings, or simply instantiate parallel array queries via the Node.js bridge `Promise.all` mechanic, merging and re-scoring the Top K results dynamically.

### 3. Interactive Index Management

- **Goal:** Move beyond pure "ingestion" to allow active "pruning" within the GUI.
- **Implementation:** Expose an api `DELETE /api/vectors/{id}` endpoint. The Node server will rewrite the `.vectors.bin` array excluding the target index, triggering a hot-reload automatically.

### 4. Vector Metrics Dashboard

- **Goal:** Visualize index health (e.g., token saturation, file types).
- **Implementation:** Introduce a new "Statistics" tab leveraging Chart.js mapped to the existing `Get-VectorMetrics.ps1` telemetry payload.

---

## Part 2: Aspirational Features (Long Term Vision)

These features structurally modify the pipeline architecture to accomplish exponential scaling or entirely new interaction paradigms.

### 1. GraphRAG / Knowledge Graph Extraction

- **Goal:** Instead of pure vector similarity, the system structurally understands relationships between entities to answer complex multi-hop reasoning questions.
- **Implementation Strategy:** During ingestion (`SmartTextChunker`), emit secondary arrays of "Triplets" using a lightweight instruction-tuned LLM. (e.g., `[Subject] -> [Relationship] -> [Object]`). Queries then map graph-traversals alongside traditional cosine similarity.

### 2. Database Disaggregation (Scale > 100k Vectors)

- **Goal:** Overcome the inherent memory ceiling of mapping unstructured `Float32Arrays` dynamically inside V8.
- **Implementation Strategy:** When collections cross the 100k boundary (roughly 300MB+ in raw float matrices), transition the `.vectors.bin` flat-file abstraction to a local specialized vector engine. The highest contender is **SQLite + `sqlite-vss` extension**, maintaining the strictly portable, zero-dependency environment ethos without sacrificing speed via HNSW graph algorithms.

### 3. Voice / Speech Telemetry (STT / TTS)

- **Goal:** True "JARVIS-like" hands-free interaction.
- **Implementation Strategy:** Integrate Whisper.cpp binaries directly onto the host environment. The GUI utilizes native browser `MediaRecorder` APIs intercepting mic data, forwarding audio streams to Node.js, compiling transcriptions, calculating vector similarities via Ollama, and synthesizing audio responses entirely on-device natively.
