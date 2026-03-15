---
doc_state: canonical
doc_owner: maintainers
canonical_ref: docs/DEVELOPER_ONBOARDING.md
last_reviewed: 2026-03-14
audience: contributors
---
# Junior Developer Onboarding FAQ

Welcome to the Local RAG Project v2. This is an aggressive, no-nonsense onboarding document designed to answer the immediate architectural questions you probably have, explain why the "standard" ways of doing things were rejected, and set strict boundaries on how you write code here.

Read this before touching the codebase.

---

## 1. Why are we using PowerShell instead of Python?

**Q: Every AI project in the world uses Python. Why does this project use PowerShell for ingestion, chunking, and file processing?**

**A:** You are correct that Python is the industry standard. However, the exact goal of this project is to be a **zero-dependency, native desktop utility for Windows**.

- Python requires installing interpreters, managing `venv` environments, compiling `pip` native dependencies (like `sqlite` or `hnswlib`), and polluting the user's system `PATH`.
- PowerShell 7+ is pre-installed or strictly easier to distribute natively on Windows infrastructures.
- _Rule:_ **Do not suggest migrating the backend to Python.** We are trading ecosystem convenience for zero-friction user distribution.

## 2. Why don't we use a real Vector Database like ChromaDB?

**Q: I saw LanceDB in the codebase, but there's also a custom binary `.vectors.bin` store. Why didn't we just use a Dockerized Vector database or SQLite-vss?**

**A:** Remember the premise: **Zero Dependencies.**

1. We cannot ask a local desktop user to install Docker Desktop just to run ChromaDB.
2. For small to medium local datasets (under 100,000 vectors), holding `Float32Array` buffers in V8 Javascript RAM and computing Cosine Similarity on the CPU takes ~5 milliseconds. It is brutally fast and requires zero network overhead.
3. _Note on LanceDB:_ We recently introduced `@lancedb/lancedb` natively in Node.js for scalability. But the architectural philosophy remains: no external daemon processes. It must run in the existing event loop.

## 3. Why is the Frontend just Vanilla JS and HTML? Where is React?

**Q: `index.html` with raw DOM manipulations? Is this 2012? Why aren't we using React, Next.js, or Vue?**

**A:** Because complex declarative state frameworks introduce massive build steps (Webpack/Vite), thousands of `node_modules`, and strict abstraction layers.

- Web Standards have matured. Native ES6 Modules, `fetch` streams, CSS Variables, and Server-Sent Events (SSE) natively handle 99% of what we need.
- Managing an AI streaming response via raw DOM text appending is often _more_ performant than fighting React's virtual DOM diffing lifecycle.
- _Rule:_ Build complexity is our enemy. If you can do it natively in the browser without an `npm install`, do it natively.

## 4. What is the "Hot Path" vs the "Cold Path"?

**Q: I see Node.js and PowerShell both running. Which one does what?**

**A:** We use a strictly decoupled **Multi-Tier Architecture**:

1. **The Hot Path (Node.js):**
   - Handles the UI HTTP requests, RAM-based Vector querying, and Ollama LLM chat streams.
   - Node.js was chosen because it maintains instant memory access, preventing the 3-second startup penalty inherent to PowerShell. Sub-second latency is critical here.
2. **The Cold Path (PowerShell _previously_, now migrating to Node):**
   - Historically handles heavy directory traversing, SHA256 hashing, and text chunking (e.g., `Ingest-Documents.ps1`). Node.js triggers these as background processes via child spawn wrappers so the async event loop never blocks.

## 5. Security Boundaries (CRITICAL)

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

If you have questions, reference `docs/SECURITY.md` and `docs/Project_Critique.md`.
Welcome to the team.

