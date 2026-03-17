---
doc_state: canonical
doc_owner: architecture
canonical_ref: docs/Domain_Boundary_Assessment.md
last_reviewed: 2026-03-16
audience: engineering
---
# Domain Boundary Assessment

## Purpose

This artifact records a static architecture review of how well domain boundaries are currently defined in the project, where they are leaking, and where ownership remains loose.

Scope:

- static code and documentation inspection only
- no application execution
- focus on evidence, not speculation

## Executive Judgment

The project has a clear intended domain model, but the implementation is still only partially aligned to it.

What is defined well:

- the intended three-tier split is explicit
- the Node runtime now clearly owns the live chat and ingestion paths
- retrieval planning, source identity, and manifest migration are becoming real domains rather than ad hoc helpers

What is still leaky:

- the live runtime still stores core data under the PowerShell utility namespace
- legacy PowerShell still implements first-class retrieval and chat behavior
- configuration ownership is split across multiple loaders, defaults, request payloads, env vars, and client state
- the server entrypoint still carries too many unrelated concerns
- canonical documentation still contains mutually incompatible runtime narratives

Overall assessment:

- domain definition quality: moderate
- domain isolation quality: weak-to-moderate
- biggest risk: split ownership between "current Node runtime" and "legacy/utility PowerShell world"

## Intended Boundaries

The intended architecture is explicit in [docs/Architecture_Design.md](docs/Architecture_Design.md):

- React owns presentation and SSE consumption (`docs/Architecture_Design.md:22-30`)
- Node owns the hot path, ingestion orchestration, operational APIs, and runtime observability (`docs/Architecture_Design.md:32-41`)
- PowerShell is supposed to be utility and diagnostics only, not part of the live request path (`docs/Architecture_Design.md:43-50`, `docs/Architecture_Design.md:71`, `docs/Architecture_Design.md:104`)

This is a good domain model. The rest of this document measures the codebase against it.

## What Is Actually Well-Defined

### 1. Retrieval behavior is becoming a real domain

Evidence:

- retrieval modes are centralized in `gui/server/lib/retrievalModes.js`, with explicit normalization and planning (`gui/server/lib/retrievalModes.js:1-40`, `gui/server/lib/retrievalModes.js:116-200`)
- source identity rules are centralized in `gui/server/lib/sourceIdentity.js`, with clear design intent and migration notes (`gui/server/lib/sourceIdentity.js:1-14`, `gui/server/lib/sourceIdentity.js:33-84`)
- manifest migration and source-level persistence are centralized in `gui/server/lib/documentParser.js` (`gui/server/lib/documentParser.js:6-36`, `gui/server/lib/documentParser.js:100-157`)

Assessment:

- this is the strongest part of the current domain design
- the team is moving from "behavior spread across scripts" to "named runtime concepts with contracts"

### 2. Runtime ownership is mostly defined in the Node path

Evidence:

- `server.js` initializes the vector store, query logger, CORS, browse policy, queue APIs, health, metrics, models, and chat (`gui/server/server.js:32-55`, `gui/server/server.js:98-153`, `gui/server/server.js:338-939`)
- the old ingestion endpoint now returns `410` and explicitly points callers to `/api/queue` (`gui/server/server.js:939-942`)
- onboarding docs now describe Node as owner of the hot path and ingestion path, with PowerShell as utility-only (`docs/DEVELOPER_ONBOARDING.md:50-60`)

Assessment:

- the intended runtime owner is no longer ambiguous inside the live server code
- this boundary exists, but other parts of the repo still undermine it

## Domain Leaks And Loose Boundaries

### 1. Storage ownership leaks from runtime into the PowerShell utility namespace

Severity: high

Evidence:

- the architecture document declares the primary runtime vector store path as `PowerShell Scripts/Data/vector_store.lance` (`docs/Architecture_Design.md:144-150`)
- `server.js` falls back to `PowerShell Scripts/Data` for vector store initialization, metrics, and chat-time collection loading (`gui/server/server.js:98-103`, `gui/server/server.js:523-526`, `gui/server/server.js:744-747`)
- `IngestionQueue` also falls back to `PowerShell Scripts/Data` and persists `queue.json` there (`gui/server/IngestionQueue.js:75-95`)
- `XmlLogger` writes bridge logs into `PowerShell Scripts/Data` using `process.cwd()`-relative path resolution (`gui/server/lib/xmlLogger.js:6-15`)
- `healthCheck.js` independently reconstructs the same storage path with a different base strategy (`gui/server/lib/healthCheck.js:38-52`)

Why this is a leak:

- the live application runtime is supposed to be Node-owned, but its primary persistence still lives under a folder named for the utility tier
- that makes the utility namespace a hidden infrastructure dependency of the runtime domain
- it also encourages repeated path reconstruction instead of a single storage boundary object

Practical symptom:

- "where app state lives" is answered physically by the PowerShell folder, not by a runtime-owned storage module

### 2. PowerShell still owns real application behavior, not just diagnostics

Severity: high

Evidence:

- `Chat-Rag.ps1` still performs live retrieval, context assembly, prompt construction, session management, and chat generation against the shared store (`PowerShell Scripts/Chat-Rag.ps1:37-63`, `PowerShell Scripts/Chat-Rag.ps1:84-142`)
- `Query-Rag.ps1` still performs live semantic retrieval against the same shared data directory (`PowerShell Scripts/Query-Rag.ps1:38-68`, `PowerShell Scripts/Query-Rag.ps1:70-103`)
- both scripts default to `ProjectDocs`, while the current canonical config defaults to `TestIngestNodeFinal` (`PowerShell Scripts/Chat-Rag.ps1:6`, `PowerShell Scripts/Query-Rag.ps1:8`, `config/project-config.psd1:104-116`)

Why this is a leak:

- the utility tier is supposed to support diagnostics and maintenance, but it still contains a parallel application runtime for query and chat
- this means the core RAG domain is not fully owned by the Node application tier
- it also preserves a second mental model for "how retrieval works"

Practical symptom:

- there are still two first-class ways to think about the RAG system: Node runtime and PowerShell runtime

### 3. Configuration ownership is split and partially divergent

Severity: high

Evidence:

- `config/project-config.psd1` is intended as the central config file (`config/project-config.psd1:1-116`)
- `configLoader.js` duplicates a full JS default configuration mirroring the PowerShell data file (`gui/server/lib/configLoader.js:23-100`)
- PowerShell scripts do not use one shared project config loader; `Chat-Rag.ps1` and `Query-Rag.ps1` each load config directly with `Import-LocalizedData` (`PowerShell Scripts/Chat-Rag.ps1:14-24`, `PowerShell Scripts/Query-Rag.ps1:20-28`)
- `healthCheck.js` reads a stale config shape: `config?.AI_Models?.Ollama_Endpoint` instead of the active `RAG.OllamaUrl` or `Ollama.ServiceUrl` (`gui/server/lib/healthCheck.js:18-23`)
- the client still owns some settings in browser state and local storage, while request payloads also carry runtime values (`gui/client/react-client/src/hooks/useRagApi.js:3-4`, `docs/User_Configuration_Architecture_Analysis.md:20-27`)

Why this is loose:

- there is a nominal source of truth, but not a single configuration authority
- the active precedence model is spread across file defaults, env vars, request parameters, PowerShell script defaults, and UI state
- stale config field access in `healthCheck.js` proves the boundary is not reliably enforced

Practical symptom:

- configuration is centralized as an idea, but federated in implementation

### 4. The transport layer and application layer are still fused inside `server.js`

Severity: medium-high

Evidence:

- `server.js` is 827 lines long and owns:
  - server boot and config resolution
  - vector store lifecycle
  - file-browse security policy
  - queue APIs and SSE
  - health and metrics
  - model catalog
  - retrieval orchestration
  - prompt construction
  - telemetry emission
  - static asset serving
- see `gui/server/server.js:32-55`, `gui/server/server.js:98-205`, `gui/server/server.js:338-939`

Why this is loose:

- the file is acting as HTTP adapter, policy layer, orchestration layer, and part of the domain layer at the same time
- that makes domain boundaries harder to preserve because cross-cutting concerns are all colocated in one entrypoint

Practical symptom:

- changes to chat, metrics, models, queueing, and browse policy all converge on one file instead of distinct application services

### 5. Identity contracts are improving, but they are not closed yet

Severity: medium

Evidence:

- `sourceIdentity.js` explicitly says chat-time reads should be pass-through, not re-derivation (`gui/server/lib/sourceIdentity.js:4-13`)
- `server.js` still contains read-time fallback derivation for missing `SourceId` and `ChunkHash` (`gui/server/server.js:56-81`)
- the client invents `entityId` values for queue rows when the server does not provide a stable identity, including random UUID fallback (`gui/client/react-client/src/hooks/useRagApi.js:19-23`, `gui/client/react-client/src/hooks/useRagApi.js:49-92`)

Why this is loose:

- the domain contract says identities should be canonical and persisted
- the runtime still tolerates missing canonical identities and compensates in multiple places

Practical symptom:

- provenance and queue identity are recognizable domains, but the system still needs repair code at the edges

### 6. Documentation authority is itself leaking

Severity: high

Evidence:

- canonical architecture docs say Node owns live querying and ingestion, while PowerShell is for diagnostics (`docs/Architecture_Design.md:32-50`, `docs/DEVELOPER_ONBOARDING.md:50-60`)
- canonical `docs/RAG_Copilot_Instructions.md` still describes a PowerShell ingestion runtime with `/api/ingest`, `PowerShellRunner.js`, `.vectors.bin`, `.metadata.json`, `Ingest-Documents.ps1`, `SourceManifest.ps1`, and `SmartTextChunker.ps1` (`docs/RAG_Copilot_Instructions.md:26-31`, `docs/RAG_Copilot_Instructions.md:52-89`)
- the live server explicitly deprecates `/api/ingest` (`gui/server/server.js:939-942`)
- `LocalRagUtils.psd1` still references `SourceManifest.ps1` and `SmartTextChunker.ps1`, but those files are not present in the workspace (`PowerShell Scripts/LocalRagUtils/LocalRagUtils.psd1:29-53`)

Why this is a leak:

- the repo no longer has a clean boundary between "current truth" and "historical narrative"
- canonical docs are not consistently canonical in practice

Practical symptom:

- different official files tell different stories about which domain owns ingestion and storage

### 7. Observability is useful, but domain ownership is mixed

Severity: medium

Evidence:

- the runtime uses JSONL for query telemetry and XML for bridge/UI logs (`docs/Architecture_Design.md:54-61`, `gui/server/server.js:150-153`, `gui/server/lib/xmlLogger.js:33-57`)
- docs disagree on the bridge log path: some refer to `PowerShell Scripts/Data/bridge-log.xml`, others to `logs/bridge-log.xml` (`docs/Architecture_Design.md:56-58`, `docs/API_REFERENCE.md:71`, `docs/Observability_Analysis.md:42-44`, `docs/Observability_Execution_Plan.md:98`, `docs/Observability_Execution_Plan.md:341`)

Why this is loose:

- the observability domain does not yet have one authoritative storage and schema boundary
- the runtime is functional, but the ownership of log formats and locations is not settled

## Summary By Domain

| Domain | Intended Owner | Current State |
| --- | --- | --- |
| Presentation | React client | Mostly clear, but still compensates for missing server queue identity |
| Retrieval | Node runtime | Strongest domain; actively becoming explicit |
| Ingestion | Node runtime | Clear in live code, but still contested by old PowerShell narratives |
| Diagnostics | PowerShell | Leaks into application behavior through legacy query/chat flows |
| Storage | Node runtime | Leaks heavily into `PowerShell Scripts/Data` |
| Configuration | Shared config contract | Loose and partially divergent |
| Observability | Shared runtime concern | Useful but schema/path ownership is mixed |
| Documentation authority | Docs governance | Leaky; canonical files disagree |

## Conclusion

This project does not have a vague architecture problem. It has a specific ownership problem:

- the intended domains are visible
- several of the right domain modules now exist
- but runtime storage, legacy PowerShell behavior, configuration handling, and canonical documentation still cross those boundaries

The most important next architectural move would be to finish the ownership transition:

1. make runtime storage a first-class Node-owned domain instead of a PowerShell-folder convention
2. demote legacy PowerShell chat/query flows from parallel runtime to explicitly secondary tooling
3. collapse configuration access behind one authoritative contract
4. split `server.js` into smaller application services
5. reconcile canonical docs so the repo only has one current runtime narrative
