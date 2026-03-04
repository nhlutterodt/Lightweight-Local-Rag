# Deep Assessment: Application Footprint Size

This document summarizes the current footprint size of the Local RAG application across multiple dimensions. This assessment provides a baseline understanding of the system's weight and resource utilization before any potential refactoring or optimization.

## 1. Codebase Size (Text & Scripts)

The actual developer-written codebase is extremely lightweight.

*   **Total Text Source Code**: ~1.5 MB
    *   **PowerShell Scripts ([.ps1](file:///c:/Users/Owner/Local-Rag-Project-v2/Local-RAG-Project-v2/Start-Gui.ps1))**: ~450 KB (66 files)
    *   **JavaScript/React (`.js`, `.jsx`)**: ~410 KB (50 files)
    *   **Configuration ([.json](file:///c:/Users/Owner/Local-Rag-Project-v2/Local-RAG-Project-v2/req.json))**: ~8.6 MB (58 files, mostly `package-lock.json` files)
    *   **Markup/Styling (`.html`, `.css`, [.md](file:///c:/Users/Owner/Local-Rag-Project-v2/Local-RAG-Project-v2/README.md))**: ~660 KB

> [!TIP]
> The core logic (PowerShell + JS) is under 1 MB total, indicating that the application's native footprints are very slim and easily maintainable.

## 2. Dependency Size

The Node.js ecosystems introduce the standard dependency weight.

*   **GUI Server `node_modules`**: ~231 MB
*   **GUI Client `node_modules`**: ~67 MB
*   **Total Dependency Footprint**: ~298 MB

## 3. Docker Image Footprint

The Docker images constitute the bulk of the application's static disk footprint.

| Image | Size | Notes |
| :--- | :--- | :--- |
| `ollama/ollama:latest` | 5.66 GB | Contains the Ollama runtime and base layers. Downloaded models add to the volume footprint. |
| `local-rag-project-v2-server` | 1.92 GB | Built on `node:20-bookworm` (1.1 GB base image) + dependencies. |
| `local-rag-project-v2-client` | 62.3 MB | Highly optimized image (likely Nginx/Alpine) for serving static assets. |
| **Total Active Images** | **~7.64 GB** | |

> [!NOTE]
> The server image is notably large (1.92 GB). Switching from a full Debian `node:20-bookworm` base to a `node:20-alpine` base image in the future could drastically reduce this footprint.

## 4. Data & State Volumes

Persistent data utilizes minimal space, heavily dependent on the sheer volume of user-ingested documents.

*   **Vector Database (`db_data`)**: 53.66 MB (LanceDB structure `.manifest`, `.bin`, `.lance` files)
*   **Ingestion Data (`ingest_data`)**: 108 KB (User uploaded files)
*   **Ollama Data (`ollama_data`)**: ~500 Bytes (Metadata/config, models are stored elsewhere or within the main volume mapping)

## 5. Runtime Storage Footprint

When the containers are actively running, their writable layers consume minimal additional space:

*   **Server Writable Layer**: ~55 KB
*   **Client Writable Layer**: ~1 KB
*   **Ollama Writable Layer**: 0 Bytes
*   **Client Memory Usage**: ~18 MB RAM (idle)

---

## Executive Summary

1.  **Code is Tiny**: The custom application logic is remarkably small (< 1 MB).
2.  **Dependencies are Average**: The ~300 MB `node_modules` footprint is typical for modern full-stack web applications.
3.  **Docker is the Heaviest Component**: The 1.9GB Node.js server image and the 5.6GB Ollama image dominate the disk usage. If disk optimization becomes a priority, the server Dockerfile is the prime candidate for easy wins (e.g., using Alpine Linux bases).
4.  **Data Scalability**: The LanceDB Vector database dynamically scales. Currently, it sits at a very manageable ~53 MB, indicating efficient storage of the existing embedding vectors.
