# Security Guidelines and Posture

The Local RAG Project is designed as a desktop-first, offline-capable utility. However, because it relies on web technologies (Node.js, Express, React) and system-level scripting (PowerShell), it is critical to maintain strict security boundaries to prevent local privilege escalation or cross-origin data exfiltration.

## Core Security Principles

1. **Local Isolation First**: The application must never expose its APIs or data to the local network (LAN) or the public internet unless explicitly configured and authenticated by the user.
2. **Least Privilege File Access**: The application must only read and write to directories that the user explicitly designates for RAG operations.
3. **Strict Code Evaluation**: The project must never dynamically evaluate unvalidated strings as code (e.g., via `Invoke-Expression` or `eval()`).

---

## Known Anti-Patterns and Prohibited Practices

Based on recent security audits, the following practices are strictly prohibited in this project:

### 1. Broad Network Binding

**Prohibited:** `app.listen(PORT)`
By default, Node.js listens on all network interfaces (`0.0.0.0` or `::`). This exposes the unauthenticated local API to anyone on the same Wi-Fi network.

**Required:** `app.listen(PORT, '127.0.0.1')`
Always bind explicitly to the localhost loopback interface.

### 2. Unrestricted CORS

**Prohibited:** `app.use(cors())`
Allowing all origins (`*`) means any website a user visits in their browser can make background requests to the local API.

**Required:** `app.use(cors({ origin: "http://localhost:5173" }))`
Restrict CORS strictly to the known local frontend URL.

### 3. Broad File System Access

**Prohibited:** Defaulting file exploration or ingestion roots to `os.homedir()` or `C:\`.
This turns a simple directory listing feature into a dangerous arbitrary file-read vulnerability if the API is ever exposed.

**Required:** Define strict, constrained folders for RAG operations (e.g., `~/RAG_Documents`) and validate all incoming paths against this root to prevent path traversal (`../`).

### 4. Dynamic Code Evaluation in PowerShell

**Prohibited:** `Invoke-Expression "some string with $($UserVar)"`
Dynamic string evaluation in PowerShell is highly susceptible to command injection if any part of the string is derived from user input or file names.

**Required:** Use static method invocations, parameterized ScriptBlocks, or strongly typed object instantiation:

```powershell
# Safe instantiation:
$sb = [scriptblock]::Create("[XMLLogger]::NewWithContextualPath('execution', 'context', `$args[0], `$args[1])")
$logger = & $sb $arg1 $arg2
```

---

## Recent Security Remediations (March 2026)

- **Node.js**: The API bridge was patched to bind exclusively to `127.0.0.1` and restrict CORS to `localhost:5173`.
- **File Access**: The `/api/browse` and `/api/queue` endpoints were restricted to a designated `RAG_Documents` folder, mitigating arbitrary file access.
- **PowerShell**: Removed `Invoke-Expression` vulnerabilities from `ExecutionContext.ps1` to prevent command injection via manipulated operational names.
