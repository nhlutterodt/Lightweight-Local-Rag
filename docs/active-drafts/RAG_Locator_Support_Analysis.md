---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/Technical_Component_Design.md
last_reviewed: 2026-03-16
audience: engineering
---
# Phase 0 Analysis: Locator Support and Extractor Fidelity

## Purpose

This document records the current locator support and extractor fidelity of the live Node-native ingestion runtime across markdown, PowerShell, XML, plain text, and PDF sources.

The purpose is to replace assumptions with evidence before Phase A and Phase B harden any locator schema into manifest, LanceDB, SSE, or citation contracts.

## Scope

This analysis covers the active Node ingestion runtime only.

Reviewed implementation anchors:

1. `gui/server/IngestionQueue.js`
2. `gui/server/lib/smartChunker.js`
3. `gui/server/lib/documentParser.js`
4. `gui/server/tests/smartChunker.test.js`
5. `gui/server/tests/documentParser.test.js`

It does not assume locator fidelity from historical PowerShell ingestion paths, because those are not the authoritative live runtime.

## Current Runtime Extraction Path

Current live extraction behavior:

1. Non-PDF files are read by `fs.promises.readFile(filePath, "utf8")`.
2. PDF files are parsed with `pdf2json`.
3. The PDF callback ignores structured `pdfData` and instead uses `pdfParser.getRawTextContent()`.
4. The chunker then operates on plain strings with contextual labels and structural-path hints.
5. The resulting LanceDB rows persist `Text`, `FileName`, `ChunkIndex`, `HeaderContext`, `FileType`, `ChunkType`, `StructuralPath`, and `EmbeddingModel`.

Current runtime conclusion:

The live ingestion path persists structural context, but it does not persist explicit positional locators such as lines, pages, or character offsets.

## Current Persisted Provenance Fields

Persisted today in LanceDB rows:

1. `FileName`
2. `ChunkIndex`
3. `Text`
4. `HeaderContext`
5. `FileType`
6. `ChunkType`
7. `StructuralPath`
8. `EmbeddingModel`

Not persisted today:

1. `lineStart`
2. `lineEnd`
3. `pageStart`
4. `pageEnd`
5. `charStart`
6. `charEnd`
7. `locatorType`
8. `symbolName`
9. `sectionPath` as a dedicated field distinct from `StructuralPath`

## Support Matrix

| File Type | Current Extractor Fidelity | Current Chunking Fidelity | Current Persisted Locator Support | Current Safe Locator State |
| --- | --- | --- | --- | --- |
| Markdown | Full UTF-8 text string | Heading-aware section chunking with hierarchical breadcrumb path | No explicit line, char, or section locator fields | `section` only via `HeaderContext` and `StructuralPath` |
| PowerShell | Full UTF-8 text string | Declaration-aware chunking for `param`, `function`, `class`, `filter` plus help-block attachment heuristic | No explicit line, char, or dedicated symbol locator fields | coarse declaration context only |
| XML | Full UTF-8 text string | Regex-based `LogEntry` preservation or heuristic closing-tag segmentation | No explicit XML path, line, or char locator fields | coarse structural context only |
| Plain Text | Full UTF-8 text string | Paragraph-aware chunk splitting with overlap and sentence fallback | No explicit line or char locator fields | filename context only |
| PDF | Flattened raw text from `pdf2json` | Plain-text fallback chunking after flattening | No persisted page, block, or char locator fields | no safe positional locator support |

## File-Type Analysis

## Markdown

### Evidence

1. Markdown is routed to `splitMarkdown()`.
2. `splitMarkdown()` detects ATX-style headings with a regex.
3. The chunker builds a hierarchical header stack.
4. `HeaderContext` and `StructuralPath` preserve breadcrumb semantics such as `Header 1 > Header 2`.
5. Large sections are further split by paragraph and sentence-aware fallback.

### Fidelity Assessment

What the runtime preserves well:

1. Hierarchical section context.
2. Section-level semantic grouping.
3. Fenced code blocks are preserved as cohesive units during paragraph splitting.

What the runtime does not preserve:

1. Exact line ranges for headings or bodies.
2. Character offsets within the original file.
3. Stable sub-section locators when a section is split into multiple overlapped chunks.

### Phase 0 Conclusion

Markdown currently supports a safe section-level locator model only.

Safe current claim:

1. The system can identify a markdown chunk by structural section path.

Unsafe current claim:

1. The system cannot currently claim exact line numbers or exact character spans.

## PowerShell

### Evidence

1. PowerShell is routed to `splitPowerShell()`.
2. Boundaries are detected for `param`, `function`, `class`, and `filter` using regex.
3. Comment-based help directly above a declaration may be absorbed into the same chunk.
4. `HeaderContext` and `StructuralPath` preserve labels such as `test.ps1 > function:Get-Thing`.

### Fidelity Assessment

What the runtime preserves well:

1. High-value declaration boundaries.
2. Coarse symbol naming embedded in `HeaderContext`.
3. Semantic grouping of code and adjacent help text in some cases.

What the runtime does not preserve:

1. Exact line numbers for declarations.
2. A dedicated `symbolName` field.
3. Reliable character offsets after overlap-based splitting.
4. AST-backed fidelity; current logic is regex-based, not parser-based.

### Phase 0 Conclusion

PowerShell currently supports a coarse declaration-context locator only.

Safe current claim:

1. The system can identify chunks by declaration-style context labels.

Unsafe current claim:

1. The system cannot currently claim exact line ranges or AST-precise symbol boundaries.

## XML

### Evidence

1. XML is routed to `splitXml()`.
2. If the source matches the `PowerShellLog` plus `LogEntry` schema, each `LogEntry` becomes a chunk.
3. Otherwise the chunker uses closing-tag regex heuristics to segment text.
4. `StructuralPath` is coarse and usually derived from tags like `<tag>` or `PowerShellLog > LogEntry`.

### Fidelity Assessment

What the runtime preserves well:

1. `LogEntry`-level chunking for the PowerShell log schema.
2. Coarse element identity for simple XML structures.

What the runtime does not preserve:

1. True XPath-like element paths.
2. Exact line numbers.
3. Character offsets.
4. Robust nested-structure semantics for arbitrary XML.

### Phase 0 Conclusion

XML currently supports a schema-aware coarse locator for `PowerShellLog` / `LogEntry` and a heuristic tag-level locator otherwise.

Safe current claim:

1. The system can identify PowerShell log chunks at the `LogEntry` unit level.

Unsafe current claim:

1. The system cannot currently claim stable XML paths or line ranges for general XML documents.

## Plain Text

### Evidence

1. Plain text uses `splitPlainText()`.
2. Plain text relies on `processSection()` paragraph splitting and sentence-aware fallback.
3. The only structural context is the file name.

### Fidelity Assessment

What the runtime preserves well:

1. Full extracted text.
2. Chunk coherence through paragraph and sentence-aware splitting.

What the runtime does not preserve:

1. Any dedicated structural locator.
2. Exact line numbers.
3. Character offsets.

### Phase 0 Conclusion

Plain text currently supports filename-level attribution only.

Safe current claim:

1. The system can attribute a plain-text chunk to a source file.

Unsafe current claim:

1. The system cannot currently claim line, section, or offset locators for plain-text chunks.

## PDF

### Evidence

1. PDF ingestion uses `pdf2json` in `IngestionQueue.js`.
2. The callback ignores the structured `pdfData` object.
3. The implementation calls `pdfParser.getRawTextContent()` and stores the resulting flattened text string.
4. The flattened text then flows through the plain-text chunking path.

### Fidelity Assessment

What the runtime preserves well:

1. Extracted textual content, to the extent exposed by `getRawTextContent()`.

What the runtime does not preserve:

1. Page boundaries.
2. Block layout.
3. Reading order guarantees for complex documents.
4. Exact character offsets into the original PDF structure.
5. Any persisted PDF-specific locator fields.

### Phase 0 Conclusion

PDF currently has no safe positional locator support in the live runtime.

Safe current claim:

1. The system can attribute a chunk to a PDF source file.

Unsafe current claim:

1. The system cannot currently claim page numbers, line numbers, or stable spans for PDF content.

## Cross-Cutting Fidelity Constraints

These issues affect multiple file types.

### 1. Overlap Splitting Breaks Naive Positional Claims

`processSection()` can split sections into overlapping chunks. Because the chunker does not persist origin offsets, later chunks cannot be mapped back to exact original spans safely.

Implication:

1. Any future locator implementation must compute and preserve offsets during chunk creation, not reconstruct them later from chunk text alone.

### 2. CRLF Normalization Changes Raw Offsets

The chunker normalizes `\r\n` to `\n` before processing.

Implication:

1. If exact raw-file offsets are ever required, the system must define whether offsets refer to pre-normalization bytes, normalized text characters, or human-facing line numbers.

### 3. Structural Context Is Already Valuable But Not Sufficient

`HeaderContext`, `ChunkType`, and `StructuralPath` are useful for retrieval targeting and coarse attribution.

Implication:

1. These fields should be retained, but they are not a substitute for explicit positional provenance.

## Phase 0 Decisions Supported By This Analysis

This analysis supports the following immediate decisions.

1. Do not promise universal line-range support in Phase A.
2. Do not promise page-range support for PDFs in Phase A unless the extractor path is changed to consume structured PDF page data and tests prove it.
3. Treat section-level and declaration-level structural locators as the only currently safe locator forms for markdown, PowerShell, and some XML flows.
4. Treat plain text and PDF as file-level attribution only until explicit offset or page support is implemented and tested.

## Recommended Locator Support Matrix For Phase A Planning

| File Type | Phase A Required Locator Contract | Rationale |
| --- | --- | --- |
| Markdown | `locatorType = section` minimum | Supported today via heading hierarchy |
| PowerShell | `locatorType = section` minimum | Supported today via declaration context |
| XML | `locatorType = section` minimum for log entries and coarse tags | Supported today only at coarse structural level |
| Plain Text | `locatorType = none` or `file` minimum | No positional support exists today |
| PDF | `locatorType = none` or `file` minimum | Current extractor discards page structure |

## Follow-Up Work Required Before Phase B

1. Decide whether line/offset locators will be computed during chunk formation or during source preprocessing.
2. Inspect whether `pdf2json` structured output can provide page-level anchors that meet project standards.
3. Decide whether XML should remain heuristic or move to a parser-backed locator model for supported schemas.
4. Decide whether PowerShell locator precision requires AST parsing or whether declaration-level section locators are sufficient for the first contract.
5. Add provenance fixture files that assert the currently safe locator forms before adding richer ones.

## Final Phase 0 Conclusion

The live runtime currently preserves useful structural context, but not durable positional provenance.

The correct planning baseline is therefore:

1. markdown, PowerShell, and some XML flows: coarse structural locators are supported today
2. plain text: file-level attribution only
3. PDF: file-level attribution only
4. line, page, and character locators: unsupported until explicitly implemented and tested