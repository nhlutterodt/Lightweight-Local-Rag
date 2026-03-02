import * as lancedb from "@lancedb/lancedb";

/**
 * LanceDB VectorStore Wrapper
 * Replaces the legacy `.vectors.bin` flat-file architecture.
 */
export class VectorStore {
  constructor() {
    this.db = null;
    this.table = null;
    this.dims = 0;
    this.model = null;
    this.isReady = false;
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
   * @param {number} minScore - Optional cutoff score (Note: LanceDB uses distance, typically L2 or Cosine via its index)
   */
  async findNearest(queryVec, topK, minScore) {
    if (!this.isReady || !this.table) {
      return [];
    }

    if (queryVec.length !== this.dims && this.dims !== 0) {
      throw new Error(
        `Invalid query dimensions. Expected ${this.dims}, got ${queryVec.length}`,
      );
    }

    try {
      // LanceDB native search array collapse
      const rawResults = await this.table
        .search(Array.from(queryVec))
        .limit(topK)
        .toArray();

      const results = [];

      for (const r of rawResults) {
        // Map LanceDB generic response into the strict format expected by server.js / main.js
        results.push({
          score: r._distance, // For now, pass distance down. Real cosine score mapping requires knowing the distance metric used during table creation.
          ChunkText: r.Text || r.ChunkText,
          TextPreview:
            r.TextPreview || (r.Text ? r.Text.substring(0, 150) + "..." : ""),
          FileName: r.FileName,
          ChunkIndex: r.ChunkIndex,
          HeaderContext: r.HeaderContext,
        });
      }

      return results;
    } catch (err) {
      console.error("[VectorStore] Search Error:", err);
      return [];
    }
  }
}
