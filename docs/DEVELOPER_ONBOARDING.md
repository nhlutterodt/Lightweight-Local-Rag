---
doc_state: canonical
doc_owner: maintainers
canonical_ref: docs/DEVELOPER_ONBOARDING.md
last_reviewed: 2026-03-18
audience: contributors
---
# Junior Developer Onboarding FAQ

Welcome to the Local RAG Project v2. This is an aggressive, no-nonsense onboarding document designed to answer the immediate architectural questions you probably have, explain why the "standard" ways of doing things were rejected, and set strict boundaries on how you write code here.

Read this before touching the codebase.

---

## 1. Why are we using PowerShell instead of Python?

**Q: Every AI project in the world uses Python. Why are we not building this around a Python runtime?**

**A:** You are correct that Python is the industry standard. However, the exact goal of this project is to be a **zero-dependency, native desktop utility for Windows**.

- Python requires installing interpreters, managing `venv` environments, compiling `pip` native dependencies (like `sqlite` or `hnswlib`), and polluting the user's system `PATH`.
- Node.js owns the live ingestion and retrieval runtime because it avoids request-path cold starts and keeps queue orchestration, LanceDB access, and SSE behavior in one process.
- PowerShell remains valuable for diagnostics, reporting, standalone tooling, and XML logging, and it is still easier to distribute natively on Windows infrastructures than a Python dependency stack.
- _Rule:_ **Do not suggest migrating the backend to Python.** We are trading ecosystem convenience for zero-friction user distribution.

## 2. Why don't we use a real Vector Database like ChromaDB?

**Q: I saw LanceDB in the codebase, but there are also legacy flat-file vector artifacts in older notes. Why didn't we just use a Dockerized Vector database or SQLite-vss?**

**A:** Remember the premise: **Zero Dependencies.**

1. We cannot ask a local desktop user to install Docker Desktop just to run ChromaDB.
2. For small to medium local datasets (under 100,000 vectors), holding `Float32Array` buffers in V8 Javascript RAM and computing Cosine Similarity on the CPU takes ~5 milliseconds. It is brutally fast and requires zero network overhead.
3. _Note on LanceDB:_ We recently introduced `@lancedb/lancedb` natively in Node.js for scalability. But the architectural philosophy remains: no external daemon processes. It must run in the existing event loop.

## 3. Why are we using React and Vite for the frontend?

**Q: Why are we using React here instead of keeping the UI fully vanilla?**

**A:** The current UI is React-based because the app now manages concurrent chat streaming, queue updates, health polling, vector-index status, and richer component state than the original lightweight UI.

- React and Vite are now part of the established stack, so do not treat them as accidental complexity.
- The old vanilla client still exists as legacy fallback material in parts of the repo, but React is the primary frontend architecture.
- _Rule:_ Avoid framework churn. Build within the existing React/Vite structure unless there is a strong reason to change it.

## 4. What is the "Hot Path" vs the "Cold Path"?

**Q: I see Node.js and PowerShell both running. Which one does what?**

**A:** We use a strictly decoupled **Multi-Tier Architecture**:

1. **The Hot Path (Node.js):**
   - Handles UI HTTP requests, queue orchestration, LanceDB retrieval, Ollama chat streams, health checks, metrics, and query telemetry.
   - Node.js was chosen because it avoids PowerShell cold-start penalties on the live application path.
2. **The Background Runtime Path (also Node.js):**
   - Handles directory traversal, hashing, chunking, embedding, manifest persistence, and LanceDB writes through `IngestionQueue.js`, `DocumentParser`, and `SmartTextChunker`.
   - The goal is to keep ingestion off the chat path, not to bounce primary runtime work through PowerShell.
3. **The Utility Layer (PowerShell):**
   - Supports offline diagnostics, reporting, model checks, XML logging, and maintenance workflows.
   - It is important, but it is no longer the main request-time or ingestion-time execution engine.

## 5. How do logging, telemetry, and health checks work?

**Q: If something is slow or broken, where should I look first?**

**A:** Start with the local observability surfaces the runtime already exposes:

1. `docs/API_REFERENCE.md` for the current endpoint contracts.
2. `/api/health` for Ollama, vector-store, and local disk readiness.
3. `/api/index/metrics` for collection and vector index state.
4. `logs/query_log.v1.jsonl` for per-query telemetry, retrieval trace sets, score schema metadata, and `lowConfidence` signals.
5. `PowerShell Scripts/Data/bridge-log.xml` for bridge and UI-originated XML log entries.
6. PowerShell XML logs in `logs/` for utility and script execution details.

If you need the bigger picture, read `docs/Observability_Analysis.md` before inventing a new telemetry path.

## 6. Security Boundaries (CRITICAL)

**Q: This runs on `localhost`. I don't have to worry about security, right?**

**A:** **Wrong. This is a fireable offense.** Because this app indexes private local files and exposes an API on a web port, a vulnerability here allows any malicious website the user visits to steal their entire hard drive.

_Always enforce these invariants:_

1. **Network Binding:** Never use `app.listen(PORT)`. It binds to `0.0.0.0` and exposes the API to the local Wi-Fi. **Always explicitly bind to `127.0.0.1`.**
2. **CORS:** Never use wildcard `cors()`. Restrict origin headers explicitly to our frontend (`http://localhost:5173`).
3. **File Browsing:** Never expose `os.homedir()` or `C:\` to the `/api/browse` endpoint. Default to the first configured allowed root and enforce canonical containment.
4. **Path Policy:** Validation must be `resolve + realpath` with separator-aware boundary checks. Sibling-prefix escapes (for example `C:\data_evil` when root is `C:\data`) are security bugs.
5. **Symlink/Junction Policy:** Reject paths that traverse symbolic links or junctions by default for browse and queue ingestion entry points.
6. **API Error Contract:** Keep browse errors standardized (`BROWSE_PATH_RESTRICTED`, `BROWSE_PATH_NOT_FOUND`, `BROWSE_READ_FAILED`) and never return raw filesystem exceptions to the UI.
7. **Shell Execution:** Never construct objects dynamically using `Invoke-Expression` in PowerShell. Command injection via malicious file names is a massive risk. Use static parameterized `scriptblocks`.

If you have questions, reference `docs/SECURITY.md`, `docs/Architecture_Design.md`, and `docs/Observability_Analysis.md`.
Welcome to the team.

