export const RETRIEVAL_MODES = {
  VECTOR: "vector",
  FILTERED_VECTOR: "filtered-vector",
  HYBRID: "hybrid",
};

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function firstMatch(source, patterns) {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

export function normalizeRetrievalMode(mode, fallback = RETRIEVAL_MODES.VECTOR) {
  const normalized = normalizeText(mode);
  if (normalized === "semantic") {
    return RETRIEVAL_MODES.HYBRID;
  }

  if (
    normalized === RETRIEVAL_MODES.VECTOR ||
    normalized === RETRIEVAL_MODES.FILTERED_VECTOR ||
    normalized === RETRIEVAL_MODES.HYBRID
  ) {
    return normalized;
  }

  return normalizeText(fallback) || RETRIEVAL_MODES.VECTOR;
}

function inferQuerySignals(query) {
  const source = typeof query === "string" ? query : "";
  const lower = source.toLowerCase();

  let fileTypeEquals = "";
  if (/\b(power\s*shell|\.ps1|ps1)\b/i.test(lower)) {
    fileTypeEquals = "powershell";
  } else if (/\b(xml|logentry|powershelllog)\b/i.test(lower)) {
    fileTypeEquals = "xml";
  } else if (/\b(markdown|\.md|readme)\b/i.test(lower)) {
    fileTypeEquals = "markdown";
  } else if (/\b(javascript|\.js|node)\b/i.test(lower)) {
    fileTypeEquals = "javascript";
  }

  const fileNameContains = firstMatch(source, [
    /\b(?:in|from|file)\s+([a-zA-Z0-9_.\-]+\.[a-zA-Z0-9]+)\b/i,
    /\b([a-zA-Z0-9_.\-]+\.(?:md|ps1|js|xml|json|txt))\b/i,
  ]);

  const headerContains = firstMatch(source, [
    /\b(?:section|heading|header)\s+["']?([^"'.,!?\n]+)["']?/i,
  ]);

  return {
    fileNameContains,
    fileTypeEquals,
    headerContains,
  };
}

function normalizeConstraints(constraints) {
  if (!constraints || typeof constraints !== "object") {
    return {};
  }

  return {
    fileNameContains:
      typeof constraints.fileName === "string"
        ? constraints.fileName.trim()
        : typeof constraints.fileNameContains === "string"
          ? constraints.fileNameContains.trim()
          : "",
    fileTypeEquals:
      typeof constraints.fileType === "string"
        ? normalizeText(constraints.fileType)
        : typeof constraints.fileTypeEquals === "string"
          ? normalizeText(constraints.fileTypeEquals)
          : "",
    headerContains:
      typeof constraints.headerContext === "string"
        ? constraints.headerContext.trim()
        : typeof constraints.headerContains === "string"
          ? constraints.headerContains.trim()
          : "",
    strictFilter: constraints.strict === true || constraints.strictFilter === true,
  };
}

function hasActiveSignal(filters) {
  return Boolean(
    filters.fileNameContains || filters.fileTypeEquals || filters.headerContains,
  );
}

function normalizeOverfetchFactor(value, fallback = 4) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(10, Math.max(1, Math.floor(value)));
}

export function buildRetrievalPlan({
  mode,
  query,
  constraints,
  overfetchFactor = 4,
  hybridOverfetch = 6,
  hybridLexicalWeight = 0.35,
}) {
  const normalizedMode = normalizeRetrievalMode(mode);
  if (normalizedMode === RETRIEVAL_MODES.VECTOR) {
    return {
      mode: normalizedMode,
      vectorOptions: {
        mode: normalizedMode,
        overfetchFactor: 1,
      },
      constraintsActive: false,
    };
  }

  const inferred = inferQuerySignals(query);
  const explicit = normalizeConstraints(constraints);
  const metadataFilters = {
    fileNameContains: explicit.fileNameContains || inferred.fileNameContains,
    fileTypeEquals: explicit.fileTypeEquals || inferred.fileTypeEquals,
    headerContains: explicit.headerContains || inferred.headerContains,
  };

  const constraintsActive = hasActiveSignal(metadataFilters);
  const configuredOverfetch = normalizeOverfetchFactor(overfetchFactor, 4);
  const adaptiveOverfetch = constraintsActive ? configuredOverfetch : 1;

  if (normalizedMode === RETRIEVAL_MODES.HYBRID) {
    const hybridOverfetchFactor = normalizeOverfetchFactor(hybridOverfetch, 6);
    const normalizedLexicalWeight = Number.isFinite(hybridLexicalWeight)
      ? Math.min(0.8, Math.max(0.05, hybridLexicalWeight))
      : 0.35;
    const vectorWeight = 1 - normalizedLexicalWeight;

    return {
      mode: normalizedMode,
      vectorOptions: {
        mode: normalizedMode,
        overfetchFactor: hybridOverfetchFactor,
        metadataFilters,
        strictFilter: explicit.strictFilter,
        strictBackfill: explicit.strictFilter ? false : undefined,
        boosts: constraintsActive
          ? {
              fileName: 0.1,
              fileType: 0.08,
              headerContext: 0.1,
            }
          : null,
        lexicalQuery: query,
        fusionWeights: {
          vector: vectorWeight,
          lexical: normalizedLexicalWeight,
        },
      },
      constraintsActive,
      appliedOverfetchFactor: hybridOverfetchFactor,
      metadataFilters,
    };
  }

  return {
    mode: normalizedMode,
    vectorOptions: {
      mode: normalizedMode,
      overfetchFactor: adaptiveOverfetch,
      metadataFilters,
      strictFilter: explicit.strictFilter,
      strictBackfill: explicit.strictFilter ? false : undefined,
      boosts: constraintsActive
        ? {
            fileName: 0.2,
            fileType: 0.15,
            headerContext: 0.2,
          }
        : null,
    },
    constraintsActive,
    appliedOverfetchFactor: adaptiveOverfetch,
    metadataFilters,
  };
}