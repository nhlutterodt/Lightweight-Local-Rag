---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/Technical_Component_Design.md
last_reviewed: 2026-03-18
audience: engineering
---
# Locator Support Analysis — Fine-Grained Evidence Pass

## Purpose

This document records the current fine-grained locator support of the live
Node-native ingestion runtime across markdown, PowerShell, XML, plain text,
and PDF sources.

The purpose is to replace unresolved extractor assumptions with code-backed
evidence before any Phase F migration closure or future locator-expansion work
claims support for line, page, character, section, or symbol-level provenance.

## Scope

This analysis covers the active Node ingestion runtime only.

Reviewed implementation anchors:

1. `gui/server/IngestionQueue.js`
2. `gui/server/lib/smartChunker.js`
3. `gui/server/lib/documentParser.js`
4. `gui/server/tests/smartChunker.test.js`
5. `gui/server/tests/IngestionQueue.test.js`

It does not assume locator fidelity from historical PowerShell ingestion paths,
because those are not the authoritative live runtime.

---

## Executive Summary

The current runtime does persist coarse locator semantics, but it does not
persist fine-grained positional provenance.

What is live today:

1. `LocatorType` is persisted in LanceDB rows.
2. `StructuralPath` and `HeaderContext` are persisted in LanceDB rows.
3. Markdown emits section-style locators.
4. PowerShell emits declaration-style locators.
5. XML emits `xml-element` locators for `LogEntry` chunks and heuristic element chunks.

What is not live today:

1. `lineStart`
2. `lineEnd`
3. `pageStart`
4. `pageEnd`
5. `charStart`
6. `charEnd`
7. `symbolName` as a dedicated persisted field
8. `sectionPath` as a dedicated persisted field distinct from `StructuralPath`

Current planning consequence:

1. Fine-grained locator claims are still unsupported across all targeted file types.
2. Markdown, PowerShell, and some XML paths support coarse structural locator claims only.
3. Plain text and PDF remain file-level attribution only.

---

## Current Runtime Extraction and Persistence Path

Current live extraction behavior:

1. Non-PDF files are read by `fs.promises.readFile(filePath, "utf8")`.
2. PDF files are parsed with `pdf2json`.
3. The PDF callback ignores structured `pdfData` and instead uses `pdfParser.getRawTextContent()`.
4. The chunker operates on plain strings plus contextual labels and coarse structural-path hints.
5. The resulting LanceDB rows persist coarse provenance and compatibility fields, but not positional spans.

Current runtime conclusion:

The live ingestion path persists coarse structural context, but it does not
persist explicit positional locators such as lines, pages, or character offsets.

---

## Current Persisted Row Shape Relevant to Locators

Persisted today in LanceDB rows:

1. `FileName`
2. `SourceId`
3. `ChunkHash`
4. `ChunkIndex`
5. `chunkOrdinal`
6. `Text`
7. `HeaderContext`
8. `FileType`
9. `ChunkType`
10. `LocatorType`
11. `StructuralPath`
12. `EmbeddingModel`

Not persisted today:

1. `lineStart`
2. `lineEnd`
3. `pageStart`
4. `pageEnd`
5. `charStart`
6. `charEnd`
7. `symbolName`
8. `sectionPath` as a dedicated field distinct from `StructuralPath`

Verified evidence:

1. `SmartChunk` carries `headerContext`, `structuralPath`, and `locatorType` only.
2. `IngestionQueue` writes `LocatorType: smartChunk.locatorType || "none"`.
3. `IngestionQueue` writes `StructuralPath: smartChunk.structuralPath || smartChunk.headerContext || "None"`.
4. No active Node runtime files define or persist `lineStart`, `lineEnd`, `pageStart`, `pageEnd`, `charStart`, `charEnd`, `symbolName`, or `sectionPath`.

---

## Support Matrix

| File Type | Extractor Input Fidelity | Chunking Behavior | Persisted Locator Fields | Fine-Grained Locator State | Current Safe Locator Contract |
| --- | --- | --- | --- | --- |
| Markdown | Full UTF-8 text string | Heading-aware section chunking with hierarchical breadcrumb path | `LocatorType=section`, `HeaderContext`, `StructuralPath` | Unsupported | section-level structural locator |
| PowerShell | Full UTF-8 text string | Regex declaration chunking for `param`, `function`, `class`, `filter` plus optional help-block attachment | `LocatorType=declaration`, `HeaderContext`, `StructuralPath` | Unsupported | declaration-level structural locator |
| XML | Full UTF-8 text string | `LogEntry` preservation for PowerShell logs or heuristic closing-tag segmentation | `LocatorType=xml-element` or `none`, `HeaderContext`, `StructuralPath` | Unsupported | coarse element-level structural locator |
| Plain Text | Full UTF-8 text string | Paragraph-aware chunk splitting with overlap and sentence fallback | `LocatorType=none`, `HeaderContext`, `StructuralPath` | Unsupported | file-level attribution only |
| PDF | Flattened raw text from `pdf2json.getRawTextContent()` | Plain-text fallback after flattening | `LocatorType=none`, `HeaderContext`, `StructuralPath`, `FileType=text` | Unsupported | file-level attribution only |

---

## File-Type Analysis

## Markdown

### Evidence

1. Markdown is routed to `splitMarkdown()`.
2. `splitMarkdown()` detects ATX-style headings with a regex.
3. The chunker builds a hierarchical header stack.
4. `HeaderContext` and `StructuralPath` preserve breadcrumb semantics such as `Header 1 > Header 2`.
5. Large sections are further split by paragraph and sentence-aware fallback.
6. Emitted chunks use `locatorType = "section"`.

### Fidelity Assessment

What the runtime preserves well:

1. Hierarchical section context.
2. Section-level semantic grouping.
3. Fenced code blocks are preserved as cohesive units during paragraph splitting.
4. A stable coarse section label survives into retrieval and SSE metadata.

What the runtime does not preserve:

1. Exact line ranges for headings or bodies.
2. Character offsets within the original file.
3. Stable sub-section locators when a section is split into multiple overlapped chunks.
4. A dedicated persisted `sectionPath` field beyond `StructuralPath`.

### Conclusion

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
5. Emitted chunks use `locatorType = "declaration"`.

### Fidelity Assessment

What the runtime preserves well:

1. High-value declaration boundaries.
2. Coarse symbol naming embedded in `HeaderContext`.
3. Semantic grouping of code and adjacent help text in some cases.
4. A stable coarse declaration label survives into retrieval and SSE metadata.

What the runtime does not preserve:

1. Exact line numbers for declarations.
2. A dedicated `symbolName` field.
3. Reliable character offsets after overlap-based splitting.
4. AST-backed fidelity; current logic is regex-based, not parser-based.

### Conclusion

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
5. Emitted chunks use `locatorType = "xml-element"` for recognized element chunks and `none` for trailing text.

### Fidelity Assessment

What the runtime preserves well:

1. `LogEntry`-level chunking for the PowerShell log schema.
2. Coarse element identity for simple XML structures.
3. Structural tag-level context that survives into retrieval and SSE metadata.

What the runtime does not preserve:

1. True XPath-like element paths.
2. Exact line numbers.
3. Character offsets.
4. Robust nested-structure semantics for arbitrary XML.

### Conclusion

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
4. Emitted chunks use `locatorType = "none"`.

### Fidelity Assessment

What the runtime preserves well:

1. Full extracted text.
2. Chunk coherence through paragraph and sentence-aware splitting.
3. File attribution through `FileName`, `HeaderContext`, and `StructuralPath`.

What the runtime does not preserve:

1. Any dedicated structural locator.
2. Exact line numbers.
3. Character offsets.

### Conclusion

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
5. `SmartTextChunker` has no dedicated `.pdf` branch and no `.pdf` file-type mapping.
6. PDF chunks therefore inherit plain-text behavior and default to `FileType = text` plus `locatorType = none`.
7. The installed `pdf2json` package (`4.0.2`) documents and types a structured `Output.Pages[]` model, page-level `data` events, and per-page `Texts[]` blocks with positional coordinates.
8. A direct probe against `ingest_data/pdf_test/Publishing an App to the Google Play Store.pdf` produced `15` parser pages and `48` current runtime chunks from the flattened text path.
9. On that probe corpus, only `22` of `48` current chunks mapped cleanly to a single page by prefix/suffix matching against parser page text.
10. `9` of `48` current chunks crossed page boundaries (`prefix` found on page `N`, `suffix` found on page `N+1`).
11. `17` of `48` current chunks were only partially matchable to parser page text, which indicates normalization and flattening loss even before trying to assign a page range contract.

### Fidelity Assessment

What the runtime preserves well:

1. Extracted textual content, to the extent exposed by `getRawTextContent()`.

What the parser appears capable of exposing, but the runtime does not currently consume:

1. Page boundaries through structured `Pages[]` output.
2. Per-page text blocks through `Texts[]` arrays.
3. Positional coordinates for those text blocks (`x`, `y`, `w`, `sw`).

What the runtime does not preserve:

1. Page boundaries.
2. Block layout.
3. Reading order guarantees for complex documents.
4. Exact character offsets into the original PDF structure.
5. Any persisted PDF-specific locator fields.

### Conclusion

PDF currently has no safe positional locator support in the live runtime.

However, the parser itself does appear capable of exposing real page-scoped
structure. The blocker is the integration path, not an obvious library
limitation.

The empirical probe result is still negative for the current chunking path:
post-hoc assignment of existing flattened-text chunks to a single page or page
range would be heuristic and brittle.

Safe current claim:

1. The system can attribute a chunk to a PDF source file.

Unsafe current claim:

1. The system cannot currently claim page numbers, line numbers, or stable spans for PDF content.

Additional implementation constraint:

1. The current runtime does not preserve `FileType = pdf` in chunk rows; PDFs are effectively treated as plain text after extraction.
2. Even though `pdf2json` exposes page-level structure, the current evidence does not yet prove that those page boundaries can be converted into durable user-facing page anchors without additional parsing, ordering, and chunk-origin tracking work.
3. The direct workspace probe indicates that current chunks cannot be assigned to pages reliably after flattening; page-aware extraction and chunk formation would be required.

---

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

### 4. Fine-Grained Locator Fields Are Absent End-to-End

There are no active Node runtime fields or write paths for:

1. `lineStart`
2. `lineEnd`
3. `pageStart`
4. `pageEnd`
5. `charStart`
6. `charEnd`
7. `symbolName`

Implication:

1. No downstream API, SSE payload, telemetry row, or citation UI can truthfully expose those fields today.

### 5. PDF Page Structure Is Explicitly Discarded

The runtime uses `pdfParser.getRawTextContent()` rather than consuming structured
page-level parser output.

Implication:

1. PDF page-range support is blocked by the extractor path itself, not by an obvious absence of page data in `pdf2json`.
2. The next PDF locator decision should focus on whether `Pages[]` plus `Texts[]` can be turned into stable chunk-to-page mappings without fragile reconstruction.

---

## Evidence-Based Support Classification

This evidence supports the following current support states.

### Supported today

1. Markdown section-level structural locators.
2. PowerShell declaration-level structural locators.
3. XML element-level structural locators for `LogEntry` and simple heuristic element splits.

### Fallback-only today

1. Plain text file-level attribution.
2. PDF file-level attribution after text flattening.

### Unsupported today

1. Universal line-range locators.
2. Universal character-offset locators.
3. PDF page-range locators.
4. AST-precise symbol locators for PowerShell.
5. Stable XPath-like locators for general XML.

---

## Recommended Support Matrix For Future Planning

| File Type | Minimum truthful locator contract now | Fine-grained expansion blocker |
| --- | --- | --- |
| Markdown | `locatorType = section` | no persisted line or char offsets |
| PowerShell | `locatorType = declaration` | regex chunking only; no line or symbol fields |
| XML | `locatorType = xml-element` for coarse element chunks | no stable XML path, line, or char fields |
| Plain Text | `locatorType = none` | no structural or positional data beyond file attribution |
| PDF | `locatorType = none` | extractor discards page structure and runtime treats PDF as plain text |

---

## Follow-Up Work Required Before Any Fine-Grained Locator Commitments

1. Decide whether line and character locators will be computed during source preprocessing or during chunk formation.
2. Prototype whether `pdf2json` structured `Pages[]` plus `Texts[]` output can be converted into stable chunk-to-page mappings that meet project standards.
3. Decide whether XML should remain heuristic or move to a parser-backed locator model for supported schemas.
4. Decide whether PowerShell locator precision requires AST parsing or whether declaration-level locators are sufficient for the first committed contract.
5. Add provenance fixtures that assert the currently safe locator forms before introducing richer ones.
6. Define whether `StructuralPath` remains the long-term coarse structural field or is superseded by dedicated `sectionPath` and `symbolName` fields.

---

## Final Conclusion

The live runtime currently preserves useful structural context, but not durable
fine-grained positional provenance.

The correct planning baseline is therefore:

1. markdown: coarse section-level locator support is real today
2. PowerShell: coarse declaration-level locator support is real today
3. XML: coarse element-level locator support is real today for supported schemas and simple heuristic splits
4. plain text: file-level attribution only
5. PDF: file-level attribution only
6. line, page, character, and dedicated symbol locators: unsupported until explicitly implemented and tested