import fs from "fs";
import path from "path";

export const SCORE_SCHEMA_VERSION = "v1";
export const SCORE_TYPE = "normalized-relevance";

export function resolveQueryLogPath({
  workspaceRoot,
  explicitQueryLogPath = null,
  allowLegacySchema = false,
}) {
  const activeV1Path = path.join(workspaceRoot, "logs", "query_log.v1.jsonl");
  const legacyPath = path.join(workspaceRoot, "logs", "query_log.jsonl");

  if (explicitQueryLogPath) {
    const explicitPath = path.resolve(explicitQueryLogPath);
    const usingLegacy =
      path.basename(explicitPath).toLowerCase() === "query_log.jsonl";
    if (usingLegacy && !allowLegacySchema) {
      throw new Error(
        `Legacy query log selected (${explicitPath}) without --allow-legacy-schema.`,
      );
    }
    return {
      queryLogPath: explicitPath,
      usingLegacy,
      expectedDefaultPath: activeV1Path,
    };
  }

  if (fs.existsSync(activeV1Path)) {
    return {
      queryLogPath: activeV1Path,
      usingLegacy: false,
      expectedDefaultPath: activeV1Path,
    };
  }

  if (allowLegacySchema && fs.existsSync(legacyPath)) {
    return {
      queryLogPath: legacyPath,
      usingLegacy: true,
      expectedDefaultPath: activeV1Path,
    };
  }

  return {
    queryLogPath: activeV1Path,
    usingLegacy: false,
    expectedDefaultPath: activeV1Path,
  };
}

export function parseJsonlFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(
          `Invalid JSONL record at line ${index + 1} in ${filePath}: ${error.message}`,
        );
      }
    });
}

export function validateQueryLogSchemaRows(rows, { allowLegacySchema = false } = {}) {
  if (allowLegacySchema) {
    return;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row?.scoreSchemaVersion !== SCORE_SCHEMA_VERSION) {
      throw new Error(
        `Query log schema violation at row ${i + 1}: expected scoreSchemaVersion=${SCORE_SCHEMA_VERSION}, found ${row?.scoreSchemaVersion || "<missing>"}.`,
      );
    }
    if (row?.scoreType !== SCORE_TYPE) {
      throw new Error(
        `Query log schema violation at row ${i + 1}: expected scoreType=${SCORE_TYPE}, found ${row?.scoreType || "<missing>"}.`,
      );
    }
  }
}

export function enforceQueryLogSchema({
  queryLogPath,
  allowLegacySchema = false,
}) {
  if (!fs.existsSync(queryLogPath)) {
    return { checked: false, rowCount: 0 };
  }

  const rows = parseJsonlFile(queryLogPath);
  validateQueryLogSchemaRows(rows, { allowLegacySchema });
  return {
    checked: true,
    rowCount: rows.length,
  };
}
