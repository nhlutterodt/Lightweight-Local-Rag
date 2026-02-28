# Technical Design Components

This document deep-dives into the inner workings of the four most critical components of the RAG Pipeline: VectorStore structure, Smart Chunking, Ingestion Logic, and the SSE Streaming Contract.

---

## 1. VectorStore: Custom Binary Serialization

The project actively shuns SQLite or vector databases (like Chroma or Milvus) in favor of extremely tight raw binary memory mapped into `Float32Array`.

### `CollectionName.vectors.bin`

#### File Structure

1.  **Count (4 Bytes / Int32):** The total number of vectors in the file.
2.  **Dimensions (4 Bytes / Int32):** The length of each vector (e.g., 768 for `nomic-embed-text`).
3.  **Model Name Length (2 Bytes / UInt16):** Length of the embedding model name.
4.  **Model Name (N Bytes / UTF-8):** The string name of the model that created these vectors. (This acts as a strict guardrail to instantly fault if the user switches their config to `bge-m3` using a `nomic` store).
5.  **Payload (N _ D _ 4 Bytes / Float32Array):** Sequential floating-point representations of the chunks.

#### Mathematical Operations

Cosine similarity is computed natively within the V8 engine using simple subarray iterations. At standard prompt thresholds (<10k vectors), Node.js executes this linear scan in < 5ms. Wait times on IO and external processes are entirely bypassed.

$$Cosine Similarity(A, B) = \frac{A \cdot B}{||A|| \times ||B||}$$

For the embedded arrays, magnitude is already normalized by Ollama (length = 1), so cosine similarity reduces to simple dot product linear equations mapped against the `Buffer` object directly.

---

## 2. Smart Formatting (The `SmartTextChunker`)

Historically, splitting documents by uniform character counts caused mid-sentence or mid-code block ruptures leading to hallucination.

The `SmartTextChunker` resolves this through an aggressive `DispatchByExtension` protocol in PowerShell:

### Markdown (`.md`)

- Splits on H1/H2 header tags (`#` / `##`).
- Keeps header paths in memory and assigns them to the `HeaderContext` metadata field of the node chunk.
- When querying, the LLM not only reads the paragraph but can see the document location (e.g., `HeaderContext`: `# Technical Guide > ## Troubleshooting`).

### PowerShell Scripts (`.ps1`)

- Scans line-by-line using Regex.
- Fragments specifically exclusively around `function`, `class`, and `filter` brackets, ensuring total operational closures within the vector embeddings.

### Sentence Fallbacks

- If a chunk exceeds maximum tokens, it falls back to `$text.LastIndexOf('.')` rather than splitting mid-word.
- Incorporates a 15% sliding over-lap window to ensure context transitions seamlessly across neighboring binary segments.

---

## 3. Ingestion Queue Subsystem

The Node.js server acts as an orchestrater managing asynchronous ingestion across local processors. Since vectorization with local AI is profoundly CPU/GPU heavy, the subsystem protects the machine via a File-Backed FIFO Queue.

### `queue.json` Checkpointing

Instead of keeping arrays in memory (which disappear instantly on Node crashes), jobs are pushed directly to local disks:

```json
[
  {
    "id": "job-1718223412555",
    "path": "c:/Users/Owner/documents/legal",
    "collection": "legal",
    "status": "pending",
    "createdAt": "...ISO string"
  }
]
```

The Queue manager invokes `ChildProcess.spawn('pwsh', ['Ingest-Documents.ps1', ...])`. Node traps standard output from PowerShell.
If Node restarts abruptly, it loads `queue.json` on boot, identifies orphaned `pending` states, and resets them, ensuring zero data/job loss during heavy vectorization workloads.

---

## 4. Server-Sent Events (SSE) Interface Contract

Due to the sequential LLM generation characteristics, typical REST POST requests induce severe timeouts. The connection pathway forces a rigid structured un-directional JSON interface utilizing `text/event-stream`.

### Event Types

The client strictly parses strings adhering to `data: ${JSON}` containing one of three explicit types.

#### 1: Initializing (`status`)

Sent immediately post-request while Node.js runs native cosine queries.

```json
// data:
{ "type": "status", "message": "Applying smart search across database..." }
```

#### 2: Routing (`metadata`)

Transmits the top K nearest match arrays directly to the GUI component BEFORE the LLM generates a response. This populates the "Citations" list instantly in the UI.

```json
// data:
{
  "type": "metadata",
  "citations": [
    { "fileName": "manual.md", "score": 0.8123, "textPreview": "..." }
  ]
}
```

#### 3: Transmitting (`message`)

Ollama returns LLM outputs character by character inside recursive blocks.

```json
// data:
{ "message": { "content": " The" } }
```

```json
// data:
{ "message": { "content": " answer" } }
```

The combination guarantees responsive User Experiences simulating high-latency processes in realtime.
