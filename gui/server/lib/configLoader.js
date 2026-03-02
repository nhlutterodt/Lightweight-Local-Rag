/**
 * configLoader.js
 *
 * Pure JS replacement for the Get-ProjectConfig.ps1 → spawnSync("pwsh") pattern.
 * Reads config/project-config.psd1 from the project root, parses the PowerShell
 * hashtable format into a plain JS object, and applies environment variable overrides.
 *
 * Falls back to safe defaults if the file is missing or unparseable so the server
 * always starts.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is 3 levels up: lib/ → server/ → gui/ → project root
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");

// ---------------------------------------------------------------------------
// Default configuration — mirrors project-config.psd1 exactly
// ---------------------------------------------------------------------------
const DEFAULTS = {
  Paths: {
    LogsDirectory: "Logs",
    ReportsDirectory: "Logs/Reports",
    HtmlDirectory: "html_pages",
    ScriptsDirectory: "PowerShell Scripts",
    TestsDirectory: "PowerShell Scripts/Tests",
    ConfigDirectory: "config",
    DocsDirectory: "docs",
  },
  Logging: {
    DefaultLevel: "INFO",
    MaxFileSize: 10485760,
    RetentionDays: 30,
    MaxTotalSize: 104857600,
    ShowTimestamps: true,
    VerboseMode: false,
  },
  Schemas: {
    CurrentVersion: "1.0.0",
    MinSupportedVersion: "1.0.0",
    DefaultRootElement: "PowerShellLog",
  },
  Ollama: {
    MinSupportedVersion: "0.12.0",
    TestedVersions: ["0.12.0", "0.12.2", "0.13.0", "0.14.0"],
    ServiceUrl: "http://localhost:11434",
    ServiceTimeout: 30,
    DefaultModelFamily: "llama",
  },
  Reports: {
    DefaultFormat: "both",
    IncludeSystemInfo: true,
    TimestampFilenames: true,
    HtmlTheme: "auto",
  },
  Testing: {
    ExcludeTags: ["Integration", "Slow"],
    CIOutputFormat: "NUnitXml",
    GenerateTestResults: true,
    TestResultPath: "../Logs/TestResults.xml",
  },
  Console: {
    Colors: {
      Success: "Green",
      Error: "Red",
      Warning: "Yellow",
      Info: "Cyan",
      Muted: "Gray",
      Header: "Magenta",
    },
    IndentSize: 2,
    ShowSeparators: true,
  },
  RAG: {
    OllamaUrl: "http://localhost:11434",
    EmbeddingModel: "nomic-embed-text",
    ChatModel: "llama3.1:8b",
    ChunkSize: 1000,
    ChunkOverlap: 200,
    TopK: 5,
    MinScore: 0.5,
    MaxContextTokens: 2048,
  },
  Metadata: {
    ConfigVersion: "1.0.0",
    LastModified: "2026-01-29",
    ProjectName: "Local-RAG-Project-v2",
    Author: "Local RAG Team",
  },
};

// ---------------------------------------------------------------------------
// Minimal .psd1 parser
// Handles the subset of PowerShell Data File syntax used by project-config.psd1:
//   - @{ ... }  hashtables
//   - "string" and 'string' literals
//   - @("a","b") arrays
//   - $true / $false booleans
//   - bare integers
//   - # comments (line-level)
//   - Key = Value pairs
// Does NOT need to handle scripts, cmdlets, or complex expressions.
// ---------------------------------------------------------------------------

/**
 * Tokenises the .psd1 content into an array of tokens.
 * Strips comments and whitespace-only lines first.
 */
function tokenise(src) {
  // Remove line comments (# ...) but preserve strings
  // We normalise line endings and strip comment-only lines for simplicity
  const cleaned = src
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      // Strip inline comments, but only outside strings
      let inSingle = false;
      let inDouble = false;
      let result = "";
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === "'" && !inDouble) inSingle = !inSingle;
        else if (ch === '"' && !inSingle) inDouble = !inDouble;
        else if (ch === "#" && !inSingle && !inDouble) break; // rest is comment
        result += ch;
      }
      return result;
    })
    .join("\n");

  // Tokenise: split on meaningful punctuation while preserving string contents
  const tokens = [];
  let i = 0;
  while (i < cleaned.length) {
    const ch = cleaned[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Single-quoted string
    if (ch === "'") {
      let j = i + 1;
      while (j < cleaned.length && cleaned[j] !== "'") j++;
      tokens.push({ type: "string", value: cleaned.slice(i + 1, j) });
      i = j + 1;
      continue;
    }

    // Double-quoted string
    if (ch === '"') {
      let j = i + 1;
      while (j < cleaned.length && cleaned[j] !== '"') j++;
      tokens.push({ type: "string", value: cleaned.slice(i + 1, j) });
      i = j + 1;
      continue;
    }

    // @{ — start of hashtable
    if (ch === "@" && cleaned[i + 1] === "{") {
      tokens.push({ type: "hash_open" });
      i += 2;
      continue;
    }

    // @( — start of array
    if (ch === "@" && cleaned[i + 1] === "(") {
      tokens.push({ type: "array_open" });
      i += 2;
      continue;
    }

    // Single chars
    if (ch === "{") {
      tokens.push({ type: "brace_open" });
      i++;
      continue;
    }
    if (ch === "}") {
      tokens.push({ type: "brace_close" });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "paren_open" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "paren_close" });
      i++;
      continue;
    }
    if (ch === "=") {
      tokens.push({ type: "eq" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    if (ch === ";") {
      tokens.push({ type: "semi" });
      i++;
      continue;
    }

    // $true / $false / $null
    if (ch === "$") {
      let j = i + 1;
      while (j < cleaned.length && /\w/.test(cleaned[j])) j++;
      const kw = cleaned.slice(i + 1, j).toLowerCase();
      if (kw === "true") tokens.push({ type: "bool", value: true });
      else if (kw === "false") tokens.push({ type: "bool", value: false });
      else if (kw === "null") tokens.push({ type: "null" });
      else tokens.push({ type: "var", value: kw });
      i = j;
      continue;
    }

    // Numbers (integer or float)
    if (/[\d\-]/.test(ch) && (ch !== "-" || /\d/.test(cleaned[i + 1] || ""))) {
      let j = i;
      if (cleaned[j] === "-") j++;
      while (j < cleaned.length && /[\d.]/.test(cleaned[j])) j++;
      const raw = cleaned.slice(i, j);
      tokens.push({ type: "number", value: Number(raw) });
      i = j;
      continue;
    }

    // Identifier / keyword
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < cleaned.length && /[\w\-]/.test(cleaned[j])) j++;
      tokens.push({ type: "ident", value: cleaned.slice(i, j) });
      i = j;
      continue;
    }

    // Skip anything else
    i++;
  }
  return tokens;
}

/**
 * Recursive descent parser over tokens → plain JS value.
 */
function parse(tokens, pos = { i: 0 }) {
  const tok = tokens[pos.i];
  if (!tok) return undefined;

  // Hashtable: @{ key = val; ... } or @{ key = val ... }
  if (tok.type === "hash_open" || tok.type === "brace_open") {
    pos.i++;
    const obj = {};
    while (pos.i < tokens.length) {
      const t = tokens[pos.i];
      if (!t || t.type === "brace_close") {
        pos.i++;
        break;
      }
      if (t.type === "semi" || t.type === "comma") {
        pos.i++;
        continue;
      }

      // key
      if (t.type === "ident" || t.type === "string") {
        const key = t.value;
        pos.i++;
        // expect '='
        if (tokens[pos.i]?.type === "eq") pos.i++;
        obj[key] = parse(tokens, pos);
      } else {
        pos.i++;
      }
    }
    return obj;
  }

  // Array: @( val, val, ... )
  if (tok.type === "array_open" || tok.type === "paren_open") {
    pos.i++;
    const arr = [];
    while (pos.i < tokens.length) {
      const t = tokens[pos.i];
      if (!t || t.type === "paren_close") {
        pos.i++;
        break;
      }
      if (t.type === "comma" || t.type === "semi") {
        pos.i++;
        continue;
      }
      arr.push(parse(tokens, pos));
    }
    return arr;
  }

  // Primitives
  if (tok.type === "string") {
    pos.i++;
    return tok.value;
  }
  if (tok.type === "number") {
    pos.i++;
    return tok.value;
  }
  if (tok.type === "bool") {
    pos.i++;
    return tok.value;
  }
  if (tok.type === "null") {
    pos.i++;
    return null;
  }

  // Fallback: skip unknown token
  pos.i++;
  return undefined;
}

/**
 * Parse a .psd1 file content string into a JS object.
 * Returns null if the content cannot be parsed.
 */
export function parsePsd1(content) {
  try {
    const tokens = tokenise(content);
    const pos = { i: 0 };
    const result = parse(tokens, pos);
    return result && typeof result === "object" ? result : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads the project configuration.
 *
 * Resolution order:
 *  1. Reads config/project-config.psd1 relative to project root
 *  2. Merges with DEFAULTS (file values take precedence)
 *  3. Applies environment variable overrides (highest priority)
 *
 * Never throws — returns a complete config object even on file-not-found.
 *
 * @param {string} [projectRoot] Override for the project root path (used in tests).
 * @returns {object} Merged configuration object.
 */
export function loadConfig(projectRoot = PROJECT_ROOT) {
  let fileConfig = null;

  const configPath = path.join(projectRoot, "config", "project-config.psd1");
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf8");
      fileConfig = parsePsd1(content);
      if (fileConfig) {
        console.log(
          "[ConfigLoader] Loaded project-config.psd1 (native JS parser).",
        );
      } else {
        console.warn(
          "[ConfigLoader] Failed to parse project-config.psd1 — using defaults.",
        );
      }
    } else {
      console.warn(
        `[ConfigLoader] Config file not found at ${configPath} — using defaults.`,
      );
    }
  } catch (err) {
    console.error(
      "[ConfigLoader] Error reading config file:",
      err.message,
      "— using defaults.",
    );
  }

  // Deep merge: defaults first, then file values
  const merged = deepMerge(DEFAULTS, fileConfig || {});

  // Environment variable overrides
  if (process.env.OLLAMA_URL) {
    merged.RAG.OllamaUrl = process.env.OLLAMA_URL;
    merged.Ollama.ServiceUrl = process.env.OLLAMA_URL;
  }
  if (process.env.EMBEDDING_MODEL) {
    merged.RAG.EmbeddingModel = process.env.EMBEDDING_MODEL;
  }
  if (process.env.CHAT_MODEL) {
    merged.RAG.ChatModel = process.env.CHAT_MODEL;
  }

  return merged;
}

/**
 * Recursively merges source into target.
 * Plain objects are merged; all other values are replaced by source.
 */
function deepMerge(target, source) {
  if (!source || typeof source !== "object") return target;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
