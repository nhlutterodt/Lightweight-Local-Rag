import * as lancedb from "@lancedb/lancedb";

/**
 * LanceDB VectorStore Wrapper
 * Replaces the legacy `.vectors.bin` flat-file architecture.
 */
export class VectorStore {
  static distanceToScore(distance) {
    const numericDistance = Number(distance);

    if (!Number.isFinite(numericDistance)) {
      return 0;
    }

    // Normalize LanceDB distance into a stable higher-is-better relevance score.
    return 1 / (1 + Math.max(0, numericDistance));
  }

  constructor() {
    this.db = null;
    this.table = null;
    this.dims = 0;
    this.model = null;
    this.isReady = false;
  }

  static normalizeString(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim().toLowerCase();
  }

  static hasFilters(filters) {
    if (!filters || typeof filters !== "object") {
      return false;
    }

    return Boolean(
      filters.fileNameContains || filters.fileTypeEquals || filters.headerContains,
    );
  }

  static matchMetadataFilters(row, filters) {
    if (!VectorStore.hasFilters(filters)) {
      return { matched: true, matchedFields: [] };
    }

    const fileName = VectorStore.normalizeString(row.FileName);
    const fileType = VectorStore.normalizeString(row.FileType);
    const headerContext = VectorStore.normalizeString(row.HeaderContext);
    const matchedFields = [];

    if (filters.fileNameContains) {
      const target = VectorStore.normalizeString(filters.fileNameContains);
      if (!fileName.includes(target)) {
        return { matched: false, matchedFields: matchedFields };
      }
      matchedFields.push("fileName");
    }

    if (filters.fileTypeEquals) {
      const target = VectorStore.normalizeString(filters.fileTypeEquals);
      if (fileType !== target) {
        return { matched: false, matchedFields: matchedFields };
      }
      matchedFields.push("fileType");
    }

    if (filters.headerContains) {
      const target = VectorStore.normalizeString(filters.headerContains);
      if (!headerContext.includes(target)) {
        return { matched: false, matchedFields: matchedFields };
      }
      matchedFields.push("headerContext");
    }

    return {
      matched: true,
      matchedFields,
    };
  }

  static computeBoost(matchedFields, boosts) {
    if (!Array.isArray(matchedFields) || matchedFields.length === 0 || !boosts) {
      return 0;
    }

    let totalBoost = 0;
    for (const field of matchedFields) {
      if (field === "fileName") {
        totalBoost += Number.isFinite(boosts.fileName) ? boosts.fileName : 0;
      }
      if (field === "fileType") {
        totalBoost += Number.isFinite(boosts.fileType) ? boosts.fileType : 0;
      }
      if (field === "headerContext") {
        totalBoost += Number.isFinite(boosts.headerContext)
          ? boosts.headerContext
          : 0;
      }
    }

    return totalBoost;
  }

  static tokenizeLexicalQuery(query) {
    if (typeof query !== "string") {
      return [];
    }

    const terms = query
      .toLowerCase()
      .split(/[^a-z0-9_.\-]+/)
      .filter((token) => token.length >= 3);

    return [...new Set(terms)];
  }

  static computeLexicalScore(row, queryTerms) {
    if (!Array.isArray(queryTerms) || queryTerms.length === 0) {
      return 0;
    }

    const haystack = [
      row.ChunkText,
      row.Text,
      row.TextPreview,
      row.HeaderContext,
      row.FileName,
      row.StructuralPath,
    ]
      .filter((value) => typeof value === "string")
      .join("\n")
      .toLowerCase();

    if (!haystack) {
      return 0;
    }

    let matches = 0;
    for (const term of queryTerms) {
      if (haystack.includes(term)) {
        matches += 1;
      }
    }

    return matches / queryTerms.length;
  }

  /**
   * Connects to LanceDB and opens the collection table.
   * Note: LanceDB natively persists both vectors and metadata in the same table.
   * @param {string} dbPath - The path to the LanceDB directory (e.g. Data/lancedb)
   * @param {string} collectionName - The name of the table to open
   * @param {string} requiredModel - The exact embedding model string expected (from project-config)
   */
  async load(dbPath, collectionName, requiredModel) {
    try {
      // Connect to the embedded DB directory
      this.db = await lancedb.connect(dbPath);

      // Verify the table exists before trying to open it
      const tables = await this.db.tableNames();
      if (!tables.includes(collectionName)) {
        console.warn(
          `[VectorStore] Table '${collectionName}' does not exist yet. Returning empty state.`,
        );
        this.isReady = false;
        return;
      }

      this.table = await this.db.openTable(collectionName);

      // Verify the model matches
      // We store the 'model' in a special config table or just read the first row
      const sample = await this.table.query().limit(1).execute();

      if (sample.length > 0) {
        this.model = sample[0].EmbeddingModel || "unknown";
        if (requiredModel && this.model !== requiredModel) {
          throw new Error(
            `Embedding model mismatch: store=${this.model}, query=${requiredModel}`,
          );
        }

        // LanceDB strongly types the vector column. We can infer dims from the first row.
        if (sample[0].vector) {
          this.dims = sample[0].vector.length;
        }
      }

      this.isReady = true;
    } catch (err) {
      this.isReady = false;
      throw new Error(`Failed to load LanceDB VectorStore: ${err.message}`);
    }
  }

  get size() {
    return this.isReady ? -1 : 0; // LanceDB handles scale natively, calculating exact rows requires a full count query
  }

  /**
   * Searches the LanceDB table using optimized IVF-PQ / Flat search.
   * @param {Float32Array|Array<number>} queryVec - The query vector
   * @param {number} topK - Maximum results to return
    * @param {number} minScore - Optional normalized relevance cutoff where higher is better
   */
  async findNearest(queryVec, topK, minScore, options = {}) {
    if (!this.isReady || !this.table) {
      return [];
    }

    if (queryVec.length !== this.dims && this.dims !== 0) {
      throw new Error(
        `Invalid query dimensions. Expected ${this.dims}, got ${queryVec.length}`,
      );
    }

    try {
      const minRelevance = Number.isFinite(minScore) ? Math.max(0, minScore) : 0;
      const requestedTopK = Number.isFinite(topK) ? Math.max(1, topK) : 5;
      const overfetchFactor = Number.isFinite(options.overfetchFactor)
        ? Math.min(10, Math.max(1, Math.floor(options.overfetchFactor)))
        : 1;
      const candidateLimit = requestedTopK * overfetchFactor;
      const strictFilter = options.strictFilter === true;
      const metadataFilters = options.metadataFilters || null;
      const hasMetadataFilters = VectorStore.hasFilters(metadataFilters);
      const boosts = options.boosts || null;
      const shouldEvaluateMetadata = hasMetadataFilters || boosts !== null;
      const strictBackfillEnabled =
        strictFilter && hasMetadataFilters && options.strictBackfill !== false;
      const includeDropTrace = options.includeDropTrace === true;
      const mode = VectorStore.normalizeString(options.mode) || "vector";
      const lexicalQueryTerms = VectorStore.tokenizeLexicalQuery(
        options.lexicalQuery,
      );
      const isHybridMode = mode === "hybrid";
      const fusionWeights = options.fusionWeights || { vector: 0.65, lexical: 0.35 };
      const vectorWeight = Number.isFinite(fusionWeights.vector)
        ? fusionWeights.vector
        : 0.65;
      const lexicalWeight = Number.isFinite(fusionWeights.lexical)
        ? fusionWeights.lexical
        : 0.35;

      // LanceDB native search array collapse
      const rawResults = await this.table
        .search(Array.from(queryVec))
        .limit(candidateLimit)
        .toArray();

      const results = [];
      const strictMatches = [];
      const strictBackfillPool = [];
      const traceRetrievedCandidates = [];
      const traceDroppedCandidates = [];

      const mapResult = (row, score, rankingScore = score) => ({
        score,
        rankingScore,
        SourceId: row.SourceId,
        ChunkHash: row.ChunkHash,
        chunkOrdinal: row.chunkOrdinal ?? row.ChunkIndex,
        ChunkText: row.Text || row.ChunkText,
        TextPreview:
          row.TextPreview || (row.Text ? row.Text.substring(0, 150) + "..." : ""),
        FileName: row.FileName,
        ChunkIndex: row.ChunkIndex,
        HeaderContext: row.HeaderContext,
        FileType: row.FileType,
        ChunkType: row.ChunkType,
        LocatorType: row.LocatorType,
        StructuralPath: row.StructuralPath,
        SectionPath: row.SectionPath,
        SymbolName: row.SymbolName,
        PageStart: row.PageStart,
        PageEnd: row.PageEnd,
      });

      const toTraceCandidate = (mapped, extra = {}) => ({
        score: mapped.score,
        chunkId: mapped.ChunkHash ? `chk_${mapped.ChunkHash}` : "",
        sourceId: mapped.SourceId || "",
        fileName: mapped.FileName,
        headerContext: mapped.HeaderContext || "None",
        locatorType: mapped.LocatorType || "none",
        ...(typeof mapped.SectionPath === "string" && mapped.SectionPath
          ? { sectionPath: mapped.SectionPath }
          : {}),
        ...(typeof mapped.SymbolName === "string" && mapped.SymbolName
          ? { symbolName: mapped.SymbolName }
          : {}),
        preview: mapped.TextPreview || mapped.ChunkText || "",
        ...extra,
      });

      for (const r of rawResults) {
        const score = VectorStore.distanceToScore(r._distance);
        const mappedBase = mapResult(r, score, score);
        if (includeDropTrace) {
          traceRetrievedCandidates.push(toTraceCandidate(mappedBase));
        }
        if (score < minRelevance) {
          if (includeDropTrace) {
            traceDroppedCandidates.push(
              toTraceCandidate(mappedBase, { dropReason: "below_min_score" }),
            );
          }
          continue;
        }

        let rankingScore = score;
        let isMetadataMatch = true;
        if (shouldEvaluateMetadata) {
          const { matched, matchedFields } = VectorStore.matchMetadataFilters(
            r,
            metadataFilters,
          );
          isMetadataMatch = matched;

          if (strictFilter && hasMetadataFilters && !matched) {
            if (!strictBackfillEnabled) {
              if (includeDropTrace) {
                traceDroppedCandidates.push(
                  toTraceCandidate(mappedBase, {
                    dropReason: "strict_filter_excluded",
                  }),
                );
              }
              continue;
            }
          }

          rankingScore += VectorStore.computeBoost(matchedFields, boosts);
        }

        if (isHybridMode) {
          const lexicalScore = VectorStore.computeLexicalScore(
            r,
            lexicalQueryTerms,
          );
          rankingScore = vectorWeight * rankingScore + lexicalWeight * lexicalScore;
        }

        // Map LanceDB generic response into the strict format expected by server.js / main.js
        const mappedResult = mapResult(r, score, rankingScore);

        if (strictBackfillEnabled) {
          if (isMetadataMatch) {
            strictMatches.push(mappedResult);
          } else {
            strictBackfillPool.push(mappedResult);
          }
          continue;
        }

        results.push(mappedResult);
      }

      if (strictBackfillEnabled) {
        strictMatches.sort((left, right) => right.rankingScore - left.rankingScore);
        strictBackfillPool.sort(
          (left, right) => right.rankingScore - left.rankingScore,
        );

        const needed = Math.max(0, requestedTopK - strictMatches.length);
        const backfilled = needed > 0 ? strictBackfillPool.slice(0, needed) : [];
        results.push(...strictMatches, ...backfilled);

        const finalResults = results
          .slice(0, requestedTopK)
          .map(({ rankingScore, ...result }) => result);
        if (includeDropTrace) {
          return {
            results: finalResults,
            retrievedCandidates: traceRetrievedCandidates,
            droppedCandidates: traceDroppedCandidates,
          };
        }
        return finalResults;
      }

      const finalResults = results
        .sort((left, right) => right.rankingScore - left.rankingScore)
        .slice(0, requestedTopK)
        .map(({ rankingScore, ...result }) => result);
      if (includeDropTrace) {
        return {
          results: finalResults,
          retrievedCandidates: traceRetrievedCandidates,
          droppedCandidates: traceDroppedCandidates,
        };
      }
      return finalResults;
    } catch (err) {
      console.error("[VectorStore] Search Error:", err);
      return [];
    }
  }
}
