# Phase 8: RAG Feature Implementation - Design & Strategy

## Executive Summary

Phase 8 focuses on evolving the project from a monitoring/utility suite into a functional RAG (Retrieval Augmented Generation) system. This involves implementing the core components required to ingest text, generate embeddings using Ollama, store them vector-wise, and perform semantic search.

## 1. Deliverables

### 1.1 Core Components (PowerShell Modules/Classes)

- **`OllamaClient`**: A dedicated class for interacting with Ollama APIs (Embeddings & Completion).
  - _Methods_: `Get-Embedding(text)`, `Get-Completion(prompt)`.
  - _Context_: Encapsulates generic HTTP calls, handles timeouts, and standardized error handling.
- **`VectorStore`**: An abstraction for storing and retrieving vectors.
  - _Implementation_: High-Performance C# Accelerator.
    - **Strategy**: Use `Add-Type` to compile a static C# class `VectorMath` with SIMD support (`System.Numerics.Vectors`).
  - _Features_: `Save-Vector(id, vector, metadata)`, `Find-Nearest(vector, k)`.
- **`TextChunker`**: Utility to split text files into meaningful chunks.
  - _Strategy_: Sliding window or paragraph-based splitting.

### 1.2 Scripts / Tools

- **`Ingest-Documents.ps1`**:
  - Scans a target directory (using `Reveal-FolderContents` logic).
  - Chunks text content.
  - Calls `OllamaClient` to generate embeddings.
  - Saves to `VectorStore`.
- **`Query-Rag.ps1`**:
  - Accepts a natural language query.
  - Generates query embedding.
  - Queries `VectorStore` for top _k_ matches.
  - (Optional) Sends context + query to LLM for final answer.

### 1.3 Testing & Documentation

- **Pester Tests**: Unit tests for Math operations (Cosine Similarity), API handling, and storage.
- **Performance Benchmark**: `Measure-VectorSearch.ps1` to ensure search latency is under 500ms for <10k items.

## 2. Expectations

- **Modular Architecture**: All new components must reside in or extend `LocalRagUtils`.
- **No breaking changes**: Existing monitoring scripts (`check-models.ps1`) must remain functional.
- **Local-First**: No external cloud APIs; strict dependency on local Ollama instance.
- **Performance**: Vector math in PowerShell is slow. We expect to use **Inline C# (Add-Type)** for the heavy lifting of Cosine Similarity calculations.

## 3. Identified Patterns for Success

### ✅ Pattern: Inline C# for Vector Math

PowerShell's interpreted loop speed is insufficient for calculating cosine similarity across thousands of vectors.
**Solution**: Use `Add-Type` to compile a simple C# static class `VectorMath` with a `CosineSimilarity(float[] a, float[] b)` method.

### ✅ Pattern: Batch Processing

Embedding generation can be slow.
**Solution**: The `IngestionPipeline` should process files in batches, saving progress (checkpoints) to avoid restarting from scratch on failure.

### ✅ Pattern: Structured Metadata

Vectors alone are useless without context.
**Solution**: Store metadata (SourceFile, LineNumber, Hash) alongside vectors to allow "Hybrid Search" (e.g., "vectors from file X").

## 4. Identified Anti-Patterns (To Avoid)

### ⛔ Anti-Pattern: "Pipeline Math"

Attempting to calculate similarity using `ForEach-Object` and PowerShell arithmetic operators.
_Why_: It will be orders of magnitude too slow (seconds vs milliseconds).

### ⛔ Anti-Pattern: "Memory Hogging"

Loading the entire vector dataset (e.g., 100MB+ JSON) into a standard PowerShell array var every time a query is run.
_Why_: PowerShell object overhead is huge. Use .NET `List<float[]>` or stream reading.

### ⛔ Anti-Pattern: "Tight Coupling with Model"

Hardcoding "llama2" or vector dimensions (e.g., 4096).
_Why_: User might switch to `nomic-embed-text` (768d) or `mistral`. The `VectorStore` must be agnostic to dimension size (but consistent within a collection).

### ⛔ Anti-Pattern: "JSON Bloat"

Serializing standard vector arrays (e.g., 4096 float dimensions) to text-based JSON for thousands of items creates massive files that are slow to parse.
_Why_: A 10k item dataset could easily exceed 500MB+ in JSON.
_Fix_: Use `System.IO.BinaryWriter` for the vector data or SQLite.

### ⛔ Anti-Pattern: "Context Stuffing"

Naively retrieving Top-K results and dumping them into the LLM prompt without checking token limits.
_Why_: Ollama/LLMs have fixed context windows (e.g., 4096 tokens). Overflowing this silently truncates data or errors out.
_Fix_: Implement a `TokenEstimator` (approx 4 chars/token) and strict cut-off logic.

### ⛔ Anti-Pattern: "Silent Dimension Mismatch"

Allowing ingestion of vectors with different dimensions (e.g. 768 vs 4096) into the same store/collection.
_Why_: Distance calculations will inevitably fail or produce garbage data.
_Fix_: The `VectorStore` must strictly validate headers or `CollectionMetadata` matches the incoming vector size.

## 5. Implementation Roadmap (Draft)

1.  **Step 8.1**: Create `OllamaClient` class (API wrapper) - _Foundation_.
2.  **Step 8.2**: Create `VectorMath` C# Accelerator - _Performance_.
3.  **Step 8.3**: Implement `VectorStore` (Storage & Search) - _Core_.
4.  **Step 8.4**: Build `Ingest-Documents` pipeline - _Workflow_.
5.  **Step 8.5**: Build `Query-Rag` tool - _Application_.

## 6. Regression Testing Strategy

To ensure new RAG features do not destabilize the existing monitoring utilities, we will enforce the following:

### 6.1 `Full-System-Test.ps1` Gatekeeper

- **Requirement**: The existing `Full-System-Test.ps1` MUST pass 100% before any RAG code is merged.
- **Expansion**: A new test section "11. RAG COMPONENTS" will be added to `Full-System-Test.ps1` to minimally verify `OllamaClient` and `VectorMath` availability without requiring a full heavy ingestion.

### 6.2 "Golden Vector" Verification

- **Purpose**: Ensure the C# `VectorMath` accelerator produces identical results to reference implementations.
- **Method**: Create `Tests/Data/GoldenVectors.json` containing:
  - Vector A (fixed float array)
  - Vector B (fixed float array)
  - Expected CosineSimilarity (e.g. `0.8754`)
- **Test**: A Pester test will load this, calculate via C#, and assert matching precision to 4 decimal places.

### 6.3 Memory Leak / Stability Check

- **Scenario**: Run `Ingest-Documents` on a loop of 500 iterations.
- **Pass Criteria**: Process memory must not grow linearly (indicating proper C# object disposal and variable cleanup).
