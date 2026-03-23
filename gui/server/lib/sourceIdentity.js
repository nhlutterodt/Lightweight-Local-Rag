/**
 * Canonical identity derivation for RAG provenance.
 *
 * This module is the single authoritative location for all identity primitives
 * used by both the ingestion pipeline (write time) and the chat endpoint (read
 * time).  Keeping derivation here ensures both sides hash identically and that
 * any future change touches one file.
 *
 * Design rules:
 *  - sourceId is derived from file content hash, not filename → rename-stable.
 *  - chunkId is derived from (sourceId, chunkIndex, chunkText) → content-stable.
 *  - Both identities must be stored at ingest time so chat-time reads are
 *    purely pass-through, not re-derivation.
 */

import { createHash } from "crypto";

/**
 * Deterministic 16-hex-char hash of one or more string parts.
 * Parts are joined with `||` before hashing to prevent collision across
 * fields of different lengths.
 *
 * @param {Array<string|number|null|undefined>} parts
 * @returns {string} 16-char lowercase hex string
 */
export function stableIdentityHash(parts) {
  const raw = parts
    .map((part) => (part === undefined || part === null ? "" : String(part)))
    .join("||");
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/**
 * Mints a stable logical-source identity for a newly discovered source.
 *
 * The seed is (collection, canonicalPath) so two files with the same basename
 * in different directories are always distinguished, and the identity survives
 * renames once it is persisted in the manifest.
 *
 * CALL ONCE per logical source — at first-ingest time.  After minting, read
 * the value from the manifest; never re-compute it from current path or hash.
 *
 * @param {string} collection    - Collection name (scope boundary)
 * @param {string} canonicalPath - Absolute canonical path at first ingest
 * @returns {string} `src_<16-hex>`
 */
export function mintSourceId(collection, canonicalPath) {
  return `src_${stableIdentityHash([collection, canonicalPath])}`;
}

/**
/**
 * Derives a canonical chunk hash at ingest time.
 * Inputs are the same ones later used by deriveChunkId at chat time, so
 * storing this value lets the chat path read instead of re-derive.
 *
 * @param {string} sourceId   - canonical sourceId for the parent document
 * @param {number} chunkIndex - 0-based position of the chunk within the document
 * @param {string} chunkText  - full text of the chunk as stored in the index
 * @returns {string} 16-char lowercase hex (no prefix — callers add `chk_`)
 */
export function computeChunkHash(sourceId, chunkIndex, chunkText) {
  return stableIdentityHash([sourceId, chunkIndex, chunkText || ""]);
}
