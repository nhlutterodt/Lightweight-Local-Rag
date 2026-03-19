import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  enforceQueryLogSchema,
  parseJsonlFile,
  resolveQueryLogPath,
  validateQueryLogSchemaRows,
} from "../lib/evalLogSchema.js";

describe("evalLogSchema", () => {
  let tempDir;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eval-log-schema-test-"));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("defaults to query_log.v1.jsonl discovery path", () => {
    const resolved = resolveQueryLogPath({ workspaceRoot: tempDir });
    expect(resolved.queryLogPath).toBe(
      path.join(tempDir, "logs", "query_log.v1.jsonl"),
    );
    expect(resolved.usingLegacy).toBe(false);
  });

  it("rejects explicit legacy query log path without allow-legacy-schema", () => {
    const legacyPath = path.join(tempDir, "logs", "query_log.jsonl");
    expect(() =>
      resolveQueryLogPath({
        workspaceRoot: tempDir,
        explicitQueryLogPath: legacyPath,
      }),
    ).toThrow(/allow-legacy-schema/i);
  });

  it("accepts explicit legacy query log path when allow-legacy-schema is enabled", () => {
    const legacyPath = path.join(tempDir, "logs", "query_log.jsonl");
    const resolved = resolveQueryLogPath({
      workspaceRoot: tempDir,
      explicitQueryLogPath: legacyPath,
      allowLegacySchema: true,
    });
    expect(resolved.queryLogPath).toBe(path.resolve(legacyPath));
    expect(resolved.usingLegacy).toBe(true);
  });

  it("rejects rows missing schema fields when legacy mode is disabled", () => {
    const rows = [
      { scoreSchemaVersion: "v1", scoreType: "normalized-relevance" },
      { query: "missing schema row" },
    ];
    expect(() => validateQueryLogSchemaRows(rows)).toThrow(
      /Query log schema violation/i,
    );
  });

  it("allows rows missing schema fields when legacy mode is enabled", () => {
    const rows = [
      { scoreSchemaVersion: "v1", scoreType: "normalized-relevance" },
      { query: "legacy row" },
    ];
    expect(() =>
      validateQueryLogSchemaRows(rows, { allowLegacySchema: true }),
    ).not.toThrow();
  });

  it("enforces schema against legacy fixture JSONL without opt-in", () => {
    const fixturePath = path.resolve(
      process.cwd(),
      "tests/data/legacy_query_log_missing_schema.jsonl",
    );
    expect(() => enforceQueryLogSchema({ queryLogPath: fixturePath })).toThrow(
      /scoreSchemaVersion/i,
    );
  });

  it("accepts v1 fixture JSONL schema", () => {
    const fixturePath = path.resolve(
      process.cwd(),
      "tests/data/query_log_v1_sample.jsonl",
    );
    const result = enforceQueryLogSchema({ queryLogPath: fixturePath });
    expect(result.checked).toBe(true);
    expect(result.rowCount).toBe(2);
  });

  it("parseJsonlFile throws line-specific error for malformed JSON", async () => {
    const malformedPath = path.join(tempDir, "malformed.jsonl");
    await fs.writeFile(malformedPath, "{\"ok\":true}\n{not-json}\n", "utf8");

    expect(() => parseJsonlFile(malformedPath)).toThrow(/line 2/i);
  });
});
