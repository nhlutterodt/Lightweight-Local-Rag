import { readFile } from "fs/promises";

export class VectorStore {
  constructor() {
    this.count = 0;
    this.dims = 0;
    this.model = null;
    this.vectors = null; // Float32Array
    this.metadata = [];
  }

  async load(binPath, metaPath) {
    try {
      // 1. Load Metadata
      const metaRaw = await readFile(metaPath, "utf8");
      this.metadata = JSON.parse(metaRaw);

      // Ensure metadata is always an array
      if (!Array.isArray(this.metadata)) {
        this.metadata = [this.metadata];
      }

      // 2. Load Binary Vectors
      const binData = await readFile(binPath);
      const dataView = new DataView(
        binData.buffer,
        binData.byteOffset,
        binData.byteLength,
      );

      this.count = dataView.getInt32(0, true);
      this.dims = dataView.getInt32(4, true);

      let dataOffset = 8;

      // 3. Backward compatibility chunk for EmbeddingModel
      if (dataOffset < binData.length) {
        const possibleLen = dataView.getInt32(dataOffset, true);
        if (possibleLen >= 1 && possibleLen <= 256) {
          // New format: length + utf8 string
          const textBuf = binData.subarray(
            dataOffset + 4,
            dataOffset + 4 + possibleLen,
          );
          this.model = textBuf.toString("utf8");
          dataOffset += 4 + possibleLen;
        } else {
          // Legacy format: length was actually the first float
          this.model = null;
          console.warn(
            `[VectorStore] Store '${binPath}' has no embedded model name (legacy format). Validation will be skipped.`,
          );
        }
      }

      // 4. Validate and construct vectors array
      if (this.metadata.length !== this.count) {
        throw new Error(
          `Data Corruption: Vector count (${this.count}) does not match metadata count (${this.metadata.length})`,
        );
      }

      // Parse Floats directly from the calculated offset
      this.vectors = new Float32Array(
        binData.buffer,
        binData.byteOffset + dataOffset,
        this.count * this.dims,
      );
    } catch (err) {
      if (err.code === "ENOENT") {
        // Safe silence if files don't exist yet
        throw err;
      }
      throw new Error(`Failed to load VectorStore: ${err.message}`);
    }
  }

  get size() {
    return this.count;
  }

  findNearest(queryVec, topK, minScore, queryModel = null) {
    if (queryVec.length !== this.dims) {
      throw new Error(
        `Invalid query dimensions. Expected ${this.dims}, got ${queryVec.length}`,
      );
    }

    if (this.model && queryModel && this.model !== queryModel) {
      throw new Error(
        `Embedding model mismatch: store=${this.model}, query=${queryModel}`,
      );
    }

    const results = [];

    for (let i = 0; i < this.count; i++) {
      // Slice a subarray for mathematical clarity.
      // Fast paths in V8 often optimise Float32Array subarrays without heap allocations
      const subset = this.vectors.subarray(i * this.dims, (i + 1) * this.dims);

      // Compute cosine similarity
      let dotProduct = 0;
      let magA = 0;
      let magB = 0;

      for (let j = 0; j < this.dims; j++) {
        dotProduct += queryVec[j] * subset[j];
        magA += queryVec[j] * queryVec[j];
        magB += subset[j] * subset[j];
      }

      let score = 0;
      if (magA > 0 && magB > 0) {
        score = dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
      }

      if (score >= minScore) {
        // Keep it simple and construct the output directly
        const meta = this.metadata[i];
        // Format match to maintain compatibility with legacy PS script output
        results.push({
          score,
          ChunkText: meta.Metadata.ChunkText,
          TextPreview: meta.Metadata.TextPreview,
          FileName: meta.Metadata.FileName,
          ChunkIndex: meta.Metadata.ChunkIndex,
          HeaderContext: meta.Metadata.HeaderContext,
          index: i, // Kept for debugging if needed
        });
      }
    }

    // Sort descending by score and slice
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}
