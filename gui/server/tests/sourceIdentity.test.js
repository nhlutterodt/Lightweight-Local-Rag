import {
  mintSourceId,
  contentHashToSourceId,
  stableIdentityHash,
  computeChunkHash,
} from "../lib/sourceIdentity.js";

describe("mintSourceId", () => {
  it("returns src_ prefix followed by 16 hex chars", () => {
    expect(mintSourceId("myCol", "/data/doc.md")).toMatch(/^src_[0-9a-f]{16}$/);
  });

  it("is deterministic: same inputs always produce same sourceId", () => {
    const id1 = mintSourceId("col", "/data/doc.md");
    const id2 = mintSourceId("col", "/data/doc.md");
    expect(id1).toBe(id2);
  });

  it("distinguishes two files with the same basename in different directories", () => {
    const id1 = mintSourceId("col", "/data/a/report.md");
    const id2 = mintSourceId("col", "/data/b/report.md");
    expect(id1).not.toBe(id2);
  });

  it("distinguishes the same path in different collections", () => {
    const id1 = mintSourceId("colA", "/data/doc.md");
    const id2 = mintSourceId("colB", "/data/doc.md");
    expect(id1).not.toBe(id2);
  });

  it("is stable across renames once persisted (seed is first-ingest path, not current path)", () => {
    // Simulates: mint at first ingest with original path, then read from manifest on rename.
    // The test proves that the minted value is always the same for the original path,
    // so the manifest can carry it forward after a rename without re-minting.
    const originalPath = "/data/original-name.md";
    const minted = mintSourceId("col", originalPath);
    expect(minted).toBe(mintSourceId("col", originalPath));
  });

  it("does not collapse two files with identical content into one sourceId", () => {
    // Option B (content-hash identity) was rejected precisely because of this.
    // Two different paths yield different sourceIds regardless of content.
    const id1 = mintSourceId("col", "/data/fileA.md");
    const id2 = mintSourceId("col", "/data/fileB.md");
    expect(id1).not.toBe(id2);
  });
});

describe("stableIdentityHash", () => {
  it("returns a 16-char lowercase hex string", () => {
    expect(stableIdentityHash(["foo"])).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic: same parts always produce same hash", () => {
    const parts = ["src_abc123", 0, "chunk text"];
    expect(stableIdentityHash(parts)).toBe(stableIdentityHash(parts));
  });

  it("is sensitive to part order", () => {
    expect(stableIdentityHash(["a", "b"])).not.toBe(
      stableIdentityHash(["b", "a"]),
    );
  });

  it("treats null and undefined parts as empty string", () => {
    expect(stableIdentityHash([null, undefined, "x"])).toBe(
      stableIdentityHash(["", "", "x"]),
    );
  });
});

describe("contentHashToSourceId", () => {
  const VALID_HASH =
    "deadbeefcafe12345678901234567890abcdef0123456789abcdef0123456789";

  it("returns a string with src_ prefix followed by 16 hex chars", () => {
    const id = contentHashToSourceId(VALID_HASH);
    expect(id).toMatch(/^src_[0-9a-f]{16}$/);
  });

  it("same content hash always yields same sourceId (rename-stable)", () => {
    expect(contentHashToSourceId(VALID_HASH)).toBe(
      contentHashToSourceId(VALID_HASH),
    );
  });

  it("different content hashes yield different sourceIds", () => {
    const hash1 =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const hash2 =
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(contentHashToSourceId(hash1)).not.toBe(contentHashToSourceId(hash2));
  });

  it("sourceId is derived from content, not from filename (same hash = same id regardless of name)", () => {
    const sharedHash =
      "cafecafecafecafe1234567890abcdef1234567890abcdef1234567890abcdef";
    const idForOriginalName = contentHashToSourceId(sharedHash);
    const idForRenamedFile = contentHashToSourceId(sharedHash);
    expect(idForOriginalName).toBe(idForRenamedFile);
  });

  it("returns null for null input", () => {
    expect(contentHashToSourceId(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(contentHashToSourceId(undefined)).toBeNull();
  });

  it("returns null for empty string input", () => {
    expect(contentHashToSourceId("")).toBeNull();
  });

  it("uses only the first 16 hex chars of the content hash as the token", () => {
    const hash =
      "1234567890abcdef" + "ffffffffffffffffffffffffffffffffffffffffffffffff";
    const id = contentHashToSourceId(hash);
    expect(id).toBe("src_1234567890abcdef");
  });
});

describe("computeChunkHash", () => {
  it("returns a 16-char lowercase hex string", () => {
    expect(computeChunkHash("src_abc", 0, "text")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic: same inputs always produce same hash", () => {
    const h1 = computeChunkHash("src_abc123", 2, "Hello world");
    const h2 = computeChunkHash("src_abc123", 2, "Hello world");
    expect(h1).toBe(h2);
  });

  it("changes when sourceId changes (links chunk to its parent document)", () => {
    const h1 = computeChunkHash("src_aaaa", 0, "text");
    const h2 = computeChunkHash("src_bbbb", 0, "text");
    expect(h1).not.toBe(h2);
  });

  it("changes when chunkIndex changes (distinguishes sibling chunks)", () => {
    const h1 = computeChunkHash("src_abc", 0, "same text");
    const h2 = computeChunkHash("src_abc", 1, "same text");
    expect(h1).not.toBe(h2);
  });

  it("changes when chunkText changes (content-anchored identity)", () => {
    const h1 = computeChunkHash("src_abc", 0, "original text");
    const h2 = computeChunkHash("src_abc", 0, "edited text");
    expect(h1).not.toBe(h2);
  });

  it("treats null/undefined chunkText as empty string", () => {
    expect(computeChunkHash("src_abc", 0, null)).toBe(
      computeChunkHash("src_abc", 0, ""),
    );
    expect(computeChunkHash("src_abc", 0, undefined)).toBe(
      computeChunkHash("src_abc", 0, ""),
    );
  });
});
