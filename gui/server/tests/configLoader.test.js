/**
 * configLoader.test.js
 *
 * Unit tests for the native JS .psd1 config loader.
 * Covers: successful parse, file-not-found fallback, malformed input fallback,
 * environment variable overrides, and parsePsd1 edge cases.
 */

import { jest } from "@jest/globals";
import path from "path";
import os from "os";
import fs from "fs";

// We need to test fs interactions, so we'll use a real temp directory
// rather than mocking fs — simpler and more reliable for file I/O tests.

const { loadConfig, parsePsd1 } = await import("../lib/configLoader.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temp directory with an optional project-config.psd1 content. */
function makeTempRoot(psd1Content = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-config-test-"));
  if (psd1Content !== null) {
    fs.mkdirSync(path.join(dir, "config"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "config", "project-config.psd1"),
      psd1Content,
      "utf8",
    );
  }
  return dir;
}

/** Minimal valid .psd1 fixture — built with explicit newlines to avoid CRLF issues in Jest. */
const VALID_PSD1 = [
  "@{",
  "    Paths = @{",
  '        LogsDirectory    = "TestLogs"',
  '        ScriptsDirectory = "PS Scripts"',
  "    }",
  "    Ollama = @{",
  '        ServiceUrl = "http://custom-ollama:11434"',
  "        ServiceTimeout = 60",
  "    }",
  "    RAG = @{",
  '        OllamaUrl      = "http://custom-ollama:11434"',
  '        EmbeddingModel = "test-embed"',
  '        ChatModel      = "test-chat"',
  "        ChunkSize      = 512",
  "        ChunkOverlap   = 64",
  "        TopK           = 3",
  "        MinScore       = 0.7",
  "    }",
  "}",
].join("\n");

// ---------------------------------------------------------------------------
// parsePsd1 — unit tests
// ---------------------------------------------------------------------------

describe("parsePsd1()", () => {
  it("parses a simple hashtable", () => {
    const result = parsePsd1(`@{ Foo = "bar" }`);
    expect(result).toEqual({ Foo: "bar" });
  });

  it("parses nested hashtables", () => {
    const result = parsePsd1(`@{ Outer = @{ Inner = "val" } }`);
    expect(result?.Outer?.Inner).toBe("val");
  });

  it("parses integers", () => {
    const result = parsePsd1(`@{ Count = 42 }`);
    expect(result?.Count).toBe(42);
  });

  it("parses $true and $false", () => {
    const result = parsePsd1(`@{ On = $true; Off = $false }`);
    expect(result?.On).toBe(true);
    expect(result?.Off).toBe(false);
  });

  it("parses string arrays", () => {
    const result = parsePsd1(`@{ Tags = @("alpha", "beta") }`);
    expect(result?.Tags).toEqual(["alpha", "beta"]);
  });

  it("strips # comments", () => {
    const result = parsePsd1(
      `@{ # this is a comment\n  Foo = "bar" # another comment\n}`,
    );
    expect(result?.Foo).toBe("bar");
  });

  it("returns null for empty string", () => {
    expect(parsePsd1("")).toBeNull();
  });

  it("returns null for completely malformed input", () => {
    expect(parsePsd1("THIS IS NOT VALID")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadConfig() — integration with filesystem
// ---------------------------------------------------------------------------

describe("loadConfig() — file found", () => {
  let tmpRoot;
  let config;

  beforeAll(() => {
    tmpRoot = makeTempRoot(VALID_PSD1);
    config = loadConfig(tmpRoot);
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns an object", () => {
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });

  it("reads RAG settings from the file", () => {
    expect(config.RAG.EmbeddingModel).toBe("test-embed");
    expect(config.RAG.ChatModel).toBe("test-chat");
    expect(config.RAG.ChunkSize).toBe(512);
    expect(config.RAG.TopK).toBe(3);
  });

  it("reads Ollama settings from the file", () => {
    expect(config.Ollama.ServiceUrl).toBe("http://custom-ollama:11434");
    expect(config.Ollama.ServiceTimeout).toBe(60);
  });

  it("reads custom Paths from the file", () => {
    expect(config.Paths.LogsDirectory).toBe("TestLogs");
    expect(config.Paths.ScriptsDirectory).toBe("PS Scripts");
  });

  it("fills missing keys from defaults", () => {
    // VALID_PSD1 does not define Logging section
    expect(config.Logging).toBeDefined();
    expect(config.Logging.DefaultLevel).toBe("INFO");
    expect(config.Logging.MaxFileSize).toBe(10485760);
  });

  it("fills missing Paths keys from defaults", () => {
    // VALID_PSD1 only defines LogsDirectory and ScriptsDirectory
    expect(config.Paths.HtmlDirectory).toBe("html_pages");
    expect(config.Paths.DocsDirectory).toBe("docs");
  });

  it("has a complete RAG section", () => {
    expect(typeof config.RAG.OllamaUrl).toBe("string");
    expect(typeof config.RAG.MinScore).toBe("number");
    expect(typeof config.RAG.MaxContextTokens).toBe("number");
  });
});

describe("loadConfig() — file not found", () => {
  let tmpRoot;
  let config;

  beforeAll(() => {
    // No file written — directory only
    tmpRoot = makeTempRoot(null);
    config = loadConfig(tmpRoot);
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns defaults without throwing", () => {
    expect(config).toBeDefined();
  });

  it("default RAG.OllamaUrl is localhost", () => {
    expect(config.RAG.OllamaUrl).toBe("http://localhost:11434");
  });

  it("default EmbeddingModel is nomic-embed-text", () => {
    expect(config.RAG.EmbeddingModel).toBe("nomic-embed-text");
  });

  it("default ChatModel is llama3.1:8b", () => {
    expect(config.RAG.ChatModel).toBe("llama3.1:8b");
  });
});

describe("loadConfig() — malformed .psd1 file", () => {
  let tmpRoot;
  let config;

  beforeAll(() => {
    tmpRoot = makeTempRoot("COMPLETELY BROKEN CONTENT {{{{");
    config = loadConfig(tmpRoot);
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("falls back to defaults without throwing", () => {
    expect(config).toBeDefined();
    expect(config.RAG.EmbeddingModel).toBe("nomic-embed-text");
  });
});

describe("loadConfig() — environment variable overrides", () => {
  let tmpRoot;
  let config;
  const ORIGINAL_OLLAMA_URL = process.env.OLLAMA_URL;
  const ORIGINAL_EMBEDDING = process.env.EMBEDDING_MODEL;
  const ORIGINAL_CHAT = process.env.CHAT_MODEL;

  beforeAll(() => {
    process.env.OLLAMA_URL = "http://docker-ollama:11434";
    process.env.EMBEDDING_MODEL = "env-embed-model";
    process.env.CHAT_MODEL = "env-chat-model";
    tmpRoot = makeTempRoot(VALID_PSD1);
    config = loadConfig(tmpRoot);
  });

  afterAll(() => {
    // Restore original env vars
    if (ORIGINAL_OLLAMA_URL === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = ORIGINAL_OLLAMA_URL;

    if (ORIGINAL_EMBEDDING === undefined) delete process.env.EMBEDDING_MODEL;
    else process.env.EMBEDDING_MODEL = ORIGINAL_EMBEDDING;

    if (ORIGINAL_CHAT === undefined) delete process.env.CHAT_MODEL;
    else process.env.CHAT_MODEL = ORIGINAL_CHAT;

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("OLLAMA_URL env var overrides file value in RAG.OllamaUrl", () => {
    expect(config.RAG.OllamaUrl).toBe("http://docker-ollama:11434");
  });

  it("OLLAMA_URL env var overrides file value in Ollama.ServiceUrl", () => {
    expect(config.Ollama.ServiceUrl).toBe("http://docker-ollama:11434");
  });

  it("EMBEDDING_MODEL env var overrides file value", () => {
    expect(config.RAG.EmbeddingModel).toBe("env-embed-model");
  });

  it("CHAT_MODEL env var overrides file value", () => {
    expect(config.RAG.ChatModel).toBe("env-chat-model");
  });

  it("non-overridden values still come from the file", () => {
    // ChunkSize was set to 512 in VALID_PSD1
    expect(config.RAG.ChunkSize).toBe(512);
  });
});
