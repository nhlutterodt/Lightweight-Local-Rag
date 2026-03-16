---
document_type: system-self-descriptor
project_name: Local RAG Project v2
project_aliases:
	- Lightweight Local RAG
	- Local-RAG-Project-v2
primary_runtime: nodejs
ui_stack: react-vite
utility_stack: powershell-7+
vector_store: lancedb
llm_provider_default: ollama-local
deployment_mode_default: local-first
last_updated: 2026-03-16
retrieval_intent:
	- project-summary
	- capabilities
	- constraints
	- roadmap
	- architecture
---

# Local RAG Project v2: System Self Descriptor

## Purpose

This repository implements a local Retrieval-Augmented Generation (RAG) system that runs on a user machine, retrieves relevant local content, and generates grounded responses using local models.

Primary intent:

1. Keep data local and private.
2. Provide fast retrieval and streamed chat UX.
3. Support maintainable ingestion, diagnostics, and operational tooling.

## One-Paragraph Identity

Local RAG Project v2 is a hybrid Node.js + React + PowerShell application that ingests local files, chunks and embeds content with Ollama, stores vectors in LanceDB, and serves grounded chat responses over SSE. The request hot path is Node-native for low latency, while PowerShell remains a diagnostics and utility layer for structured XML logging, health checks, and report workflows.

## Architecture at a Glance

1. Presentation tier: React/Vite client.
2. Runtime tier: Node.js Express bridge server.
3. Utility tier: PowerShell 7+ scripts and class-based modules.

Key runtime storage and state:

1. LanceDB table(s) for vectors and metadata.
2. Collection manifest JSON for file hash/change tracking.
3. Queue JSON for ingestion job persistence.
4. JSONL and XML logs for observability and diagnostics.

## Core Features

1. Local-first chat with retrieval grounding.
2. SSE streaming with status, citations, and token events.
3. Smart ingestion queue with crash-resilient persisted state.
4. Smart chunking by file type (markdown, PowerShell, XML, text fallback).
5. Metadata-rich retrieval outputs (file name, header context, relevance score, preview).
6. Query telemetry logging and index health surfaces.
7. Model validation and model-role classification for safer UX.
8. Integrity and snapshot operational tooling for LanceDB lifecycle.
9. Structured XML logging and report-generation utilities.
10. Docker Compose support for local multi-container deployment.

## Capability Matrix

### Retrieval and Generation

1. Embeds user query via local Ollama embeddings endpoint.
2. Queries LanceDB nearest neighbors and normalizes relevance score.
3. Applies retrieval mode behavior (vector, filtered vector, hybrid/semantic alias).
4. Streams model output incrementally to client over SSE.
5. Sends citations before token stream for transparent grounding.

### Ingestion and Indexing

1. Accepts queued ingestion jobs by path + collection.
2. Computes source hashes to skip unchanged files.
3. Detects renames and orphaned entries for manifest hygiene.
4. Persists queue/job state for restart recovery.
5. Re-indexes automatically when embedding model changes.

### Observability and Operations

1. Emits query telemetry to JSONL.
2. Emits structured XML logs for script and bridge events.
3. Exposes health and index metrics HTTP endpoints.
4. Exposes integrity scan and repair workflows.
5. Exposes snapshot list, rollback, and prune workflows.

## Interfaces and Contracts

Primary interface families:

1. HTTP API endpoints for health, queue, chat, metrics, and models.
2. SSE contract for chat streaming.
3. Local file contracts for manifest, queue, vector store, and logs.

SSE event contract summary:

1. Status event: retrieval/generation phase status.
2. Metadata event: citations array with retrieval evidence.
3. Message event: incremental token content.
4. Error event: structured failure payload.

## Default Operating Assumptions

1. Intended for local execution on Windows/Linux/macOS environments where Node.js and Ollama are available, or via Docker Compose.
2. Assumes local model artifacts are installed and available through Ollama.
3. Assumes persistent local filesystem for vector store, manifests, queue state, and logs.
4. Assumes offline-capable operation as a primary privacy posture.

## Restraints and Constraints

These are current design limits and practical boundaries that affect behavior.

### Architectural Constraints

1. Retrieval quality depends on ingestion quality, chunking boundaries, and model quality.
2. System is optimized for local-first operation, not multi-tenant cloud serving.
3. Runtime relies on local Ollama availability; missing models reduce or block key functions.
4. Model mismatch between stored vectors and configured embedding model requires re-indexing.

### Performance and Scale Constraints

1. Current local retrieval path is strong at small-to-medium scale and acceptable under approximately 10k vectors with current brute-force behavior.
2. Above larger corpus thresholds, index pre-filtering or alternative ANN strategy becomes increasingly important.
3. End-to-end latency is sensitive to local hardware, model size, and disk throughput.

### Operational Constraints

1. Integrity between manifest and vector rows can diverge after manual file/database interference or snapshot rollbacks.
2. Snapshot rollback restores DB state but can require explicit integrity review afterward.
3. Disk growth occurs over time from logs, snapshots, and repeated ingestion cycles unless maintained.

### Product Boundaries (Current)

1. Primary product is local RAG for grounded chat and document retrieval, not generalized workflow orchestration.
2. PowerShell utilities are maintained for diagnostics and tooling, not the user-facing hot path.
3. Some forward-looking features exist as roadmap targets and are not baseline guarantees yet.

## Roadmap Snapshot

### Completed Reliability Milestones

1. Config-driven collection naming with validation.
2. Auto re-index behavior on embedding model changes.
3. Integrity scan and repair workflow.
4. Snapshot management (list, rollback, prune).
5. Schema-versioned migration support for key persisted state.

### Near-Term Practical Enhancements

1. Richer citation metadata presentation in UI (header context, token detail, source panel).
2. Multi-collection query execution and merge/re-score behavior.
3. Interactive index pruning operations from GUI.
4. Vector metrics dashboard for health and corpus analysis.

### Long-Term Aspirational Direction

1. GraphRAG-style relationship extraction for multi-hop reasoning.
2. Storage/index evolution for larger-scale corpora (for example, specialized vector indexing paths).
3. Speech-first interaction loop (STT/TTS) for hands-free usage.

## Retrieval Keywords and Synonyms

Use these terms to improve matching during vectorization/retrieval:

1. local rag
2. offline rag
3. ollama local llm
4. lancedb vector store
5. smart chunking
6. source manifest
7. ingestion queue
8. server-sent events
9. citation metadata
10. query telemetry
11. integrity check
12. snapshot rollback
13. model migration
14. private on-device ai
15. node bridge powershell diagnostics

## End-User Description Template

If asked "What is this project?", use this default response:

"This project is a local-first RAG assistant that indexes your files on your machine, retrieves the most relevant passages, and streams grounded responses using local Ollama models. It emphasizes privacy, transparent citations, and operational reliability through queue persistence, integrity checks, and snapshot tooling."

## Maintainer Notes

1. Keep this document deterministic and high-signal.
2. Update this descriptor whenever architecture, contracts, or roadmap intent materially changes.
3. Keep statements implementation-aligned with canonical docs and tested behavior.
