---
doc_state: active-draft
doc_owner: backend
canonical_ref: docs/Technical_Component_Design.md
last_reviewed: 2026-03-22
audience: engineering
---
# Locator Support Analysis — Fine-Grained Evidence Pass

## Purpose

This document records the current locator support of the live Node-native
ingestion runtime across markdown, PowerShell, JavaScript, XML, plain text,
and PDF sources.

The goal is to replace unresolved extractor assumptions with code-backed
support states before any future phase claims line, page, character, section,
or symbol-level provenance beyond what the runtime can prove.

## Scope

This analysis covers the active Node ingestion runtime only.

Reviewed implementation anchors:

1. `gui/server/IngestionQueue.js`
2. `gui/server/lib/smartChunker.js`
3. `gui/server/lib/vectorStore.js`
4. `gui/server/server.js`
5. `gui/server/tests/smartChunker.test.js`
6. `gui/server/tests/IngestionQueue.test.js`
7. `gui/server/tests/pdfLocatorEvidence.test.js`
8. `gui/server/tests/sse.contract.test.js`

It does not assume locator fidelity from historical PowerShell ingestion paths,
because those are not the authoritative live runtime.

## Executive Summary

The current runtime persists only the locator fields it can prove from the
active extractor path. It does not persist universal line-level or
character-level provenance.

What is live today:

1. `LocatorType` is persisted in LanceDB rows.
2. `StructuralPath` and `HeaderContext` are persisted in LanceDB rows.
3. `SectionPath` is persisted when the chunker has truthful structural section data.
4. `SymbolName` is persisted when the chunker has truthful declaration identity.
5. `PageStart` and `PageEnd` are persisted only on the structured PDF page-range path.
6. SSE citations project only the supported optional locator fields that survive retrieval.

What is not live today:

1. `lineStart`
2. `lineEnd`
3. `charStart`
4. `charEnd`
5. universal extractor-independent page fidelity

Current planning consequence:

1. Fine-grained line and character locator claims are still unsupported across all targeted file types.
2. Markdown and XML support explicit `sectionPath` emission.
3. PowerShell and JavaScript support explicit `symbolName` emission.
4. PDF supports `pageStart` and `pageEnd` only on the structured `page-range` path.
5. Plain text remains file-level attribution only.

## Current Runtime Extraction and Persistence Path

Current live extraction behavior:

1. Non-PDF files are read by `fs.promises.readFile(filePath, "utf8")`.
2. PDF files are parsed with `pdf2json`.
3. Structured PDF page data is passed into `SmartTextChunker.splitPdfDocument()`.
4. The chunker operates on either structured PDF pages or plain strings plus contextual labels and structural hints.
5. The resulting LanceDB rows persist only supported provenance fields and omit unsupported locators.

Current runtime conclusion:

The live ingestion path persists supported structural context and PDF page
bounds, but it does not persist exact line spans or character offsets.

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
12. `SectionPath` when supported
13. `SymbolName` when supported
14. `PageStart` when supported
15. `PageEnd` when supported
16. `EmbeddingModel`

Not persisted today:

1. `lineStart`
2. `lineEnd`
3. `charStart`
4. `charEnd`

Verified evidence:

1. `SmartChunk` carries `headerContext`, `structuralPath`, `locatorType`, and optional supported locator metadata.
2. `IngestionQueue` writes `LocatorType: smartChunk.locatorType || "none"`.
3. `IngestionQueue` writes `StructuralPath: smartChunk.structuralPath || smartChunk.headerContext || "None"`.
4. `IngestionQueue` conditionally writes `SectionPath`, `SymbolName`, `PageStart`, and `PageEnd` only when the chunk metadata carries them.
5. No active Node runtime files define or persist `lineStart`, `lineEnd`, `charStart`, or `charEnd`.

## Support Matrix

| Extractor | lineStart | lineEnd | charStart | charEnd | sectionPath | symbolName | pageStart | pageEnd | Safe current contract |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Markdown | unsupported | unsupported | unsupported | unsupported | supported | unsupported | unsupported | unsupported | section-level structural locator |
| PowerShell | unsupported | unsupported | unsupported | unsupported | unsupported | supported | unsupported | unsupported | declaration-level locator with explicit symbol name |
| JavaScript | unsupported | unsupported | unsupported | unsupported | unsupported | supported | unsupported | unsupported | declaration-level locator with explicit symbol name |
| XML | unsupported | unsupported | unsupported | unsupported | supported | unsupported | unsupported | unsupported | element-level structural locator |
| Plain Text | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | file-level attribution only |
| PDF (structured page path) | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | supported | supported | page-range locator |
| PDF (flattened fallback path) | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | unsupported | file-level attribution only |

## File-Type Analysis

## Markdown

### Markdown Evidence

1. Markdown is routed to `splitMarkdown()`.
2. `splitMarkdown()` detects ATX-style headings with a regex.
3. The chunker builds a hierarchical header stack.
4. `HeaderContext`, `StructuralPath`, and `SectionPath` preserve breadcrumb semantics such as `Header 1 > Header 2`.
5. Large sections are further split by paragraph and sentence-aware fallback.
6. Emitted chunks use `locatorType = "section"`.

### Markdown Fidelity Assessment

What the runtime preserves well:

1. Hierarchical section context.
2. Section-level semantic grouping.
3. Fenced code blocks are preserved as cohesive units during paragraph splitting.
4. A stable section path survives into retrieval and SSE metadata.

What the runtime does not preserve:

1. Exact line ranges for headings or bodies.
2. Character offsets within the original file.
3. Stable sub-section locators when a section is split into multiple overlapped chunks.

### Markdown Conclusion

Markdown currently supports a safe section-level locator model only.

Safe current claim:

1. The system can identify a markdown chunk by structural section path.

Unsafe current claim:

1. The system cannot currently claim exact line numbers or exact character spans.

## PowerShell

### PowerShell Evidence

1. PowerShell is routed to `splitPowerShell()`.
2. Boundaries are detected for `param`, `function`, `class`, and `filter` using regex.
3. Comment-based help directly above a declaration may be absorbed into the same chunk.
4. `HeaderContext` and `StructuralPath` preserve labels such as `test.ps1 > function:Get-Thing`.
5. Declaration chunks persist `SymbolName`.
6. Non-declaration preamble chunks use `locatorType = "none"` rather than over-claiming declaration fidelity.

### PowerShell Fidelity Assessment

What the runtime preserves well:

1. High-value declaration boundaries.
2. Explicit symbol naming for declaration chunks.
3. Semantic grouping of code and adjacent help text in some cases.
4. A stable declaration label survives into retrieval and SSE metadata.

What the runtime does not preserve:

1. Exact line numbers for declarations.
2. Reliable line ranges after overlap-based splitting.
3. Reliable character offsets after overlap-based splitting.
4. AST-backed fidelity; current logic is regex-based, not parser-based.

### PowerShell Conclusion

PowerShell currently supports a declaration-context locator with explicit symbol names.

Safe current claim:

1. The system can identify chunks by declaration-style context labels and explicit symbol names.

Unsafe current claim:

1. The system cannot currently claim exact line ranges or AST-precise symbol boundaries.

## JavaScript

### JavaScript Evidence

1. JavaScript is routed to `splitJavaScript()`.
2. Top-level `function`, `class`, `const`, and `let` declarations are detected with regex.
3. Declaration chunks persist `SymbolName`.
4. Non-declaration preamble chunks use `locatorType = "none"`.

### JavaScript Fidelity Assessment

What the runtime preserves well:

1. Top-level declaration boundaries.
2. Explicit symbol naming for declaration chunks.
3. Stable declaration labels for retrieval targeting.

What the runtime does not preserve:

1. Exact line numbers.
2. Reliable character offsets after overlap-based splitting.
3. AST-backed fidelity for nested constructs.

### JavaScript Conclusion

JavaScript currently supports a declaration-context locator with explicit symbol names.

Safe current claim:

1. The system can identify chunks by declaration labels and explicit symbol names.

Unsafe current claim:

1. The system cannot currently claim exact line ranges or AST-precise symbol boundaries.

## XML

### XML Evidence

1. XML is routed to `splitXml()`.
2. If the source matches the `PowerShellLog` plus `LogEntry` schema, each `LogEntry` becomes a chunk.
3. Otherwise the chunker uses closing-tag regex heuristics to segment text.
4. `StructuralPath` is coarse and usually derived from tags like `<tag>` or `PowerShellLog > LogEntry`.
5. Recognized element chunks persist `SectionPath`.
6. Emitted chunks use `locatorType = "xml-element"` for recognized element chunks and `none` for trailing text.

### XML Fidelity Assessment

What the runtime preserves well:

1. `LogEntry`-level chunking for the PowerShell log schema.
2. Coarse element identity for simple XML structures.
3. Structural tag-level context that survives into retrieval and SSE metadata.

What the runtime does not preserve:

1. True XPath-like element paths.
2. Exact line numbers.
3. Character offsets.
4. Robust nested-structure semantics for arbitrary XML.

### XML Conclusion

XML currently supports a schema-aware coarse locator for `PowerShellLog` / `LogEntry` and a heuristic tag-level locator otherwise.

Safe current claim:

1. The system can identify supported XML chunks by element-level structural path.

Unsafe current claim:

1. The system cannot currently claim stable XML paths or line ranges for general XML documents.

## Plain Text

### Plain Text Evidence

1. Plain text uses `splitPlainText()`.
2. Plain text relies on `processSection()` paragraph splitting and sentence-aware fallback.
3. The only structural context is the file name.
4. Emitted chunks use `locatorType = "none"`.

### Plain Text Fidelity Assessment

What the runtime preserves well:

1. Full extracted text.
2. Chunk coherence through paragraph and sentence-aware splitting.
3. File attribution through `FileName`, `HeaderContext`, and `StructuralPath`.

What the runtime does not preserve:

1. Any dedicated structural locator.
2. Exact line numbers.
3. Character offsets.

### Plain Text Conclusion

Plain text currently supports filename-level attribution only.

Safe current claim:

1. The system can attribute a plain-text chunk to a source file.

Unsafe current claim:

1. The system cannot currently claim line, section, or offset locators for plain-text chunks.

## PDF

### PDF Evidence

1. Structured `pdf2json` page objects are passed to `splitPdfDocument()`.
2. The chunker emits `locatorType = "page-range"` with `pageStart` and `pageEnd` for structured per-page chunks.
3. The SSE citation layer emits page fields only when `locatorType === "page-range"` and both page bounds are integers.
4. The regression barrier preserves the negative case: flattened PDF text remains `locatorType = "none"` and must not emit page claims.

### PDF Fidelity Assessment

What the runtime preserves well:

1. Per-page chunk provenance on the structured PDF path.
2. Deterministic page-bound citations for structured PDF chunks.
3. Truthful suppression of page fields on flattened fallback PDF paths.

What the runtime does not preserve:

1. Multi-page locator ranges beyond what the chunker explicitly emits.
2. Character offsets inside PDF pages.
3. Universal page fidelity for all historical PDF rows.

### PDF Conclusion

PDF currently supports a truthful page-range contract only on the structured page path.

Safe current claim:

1. The system can emit `pageStart` and `pageEnd` for structured PDF page chunks.

Unsafe current claim:

1. The system cannot emit page locators for flattened historical PDF rows.

## Cross-Cutting Fidelity Constraints

### 1. Overlap Splitting Breaks Naive Positional Claims

`processSection()` can split sections into overlapping chunks. Because the
chunker does not persist origin offsets, later chunks cannot be mapped back to
exact original spans safely.

Implication:

1. Any future locator implementation must compute and preserve offsets during chunk creation, not reconstruct them later from chunk text alone.

### 2. CRLF Normalization Changes Raw Offsets

The chunker normalizes `\r\n` to `\n` before processing.

Implication:

1. If exact raw-file offsets are ever required, the system must define whether offsets refer to pre-normalization bytes, normalized text characters, or human-facing line numbers.

### 3. Structural Context Is Valuable But Not Sufficient

`HeaderContext`, `ChunkType`, `StructuralPath`, `SectionPath`, and `SymbolName`
are useful for retrieval targeting and coarse attribution.

Implication:

1. These fields should be retained, but they are not a substitute for explicit positional provenance.

### 4. Unsupported Fine-Grained Locator Fields Remain Absent End-to-End

There are no active Node runtime fields or write paths for:

1. `lineStart`
2. `lineEnd`
3. `charStart`
4. `charEnd`

Implication:

1. No downstream API, SSE payload, telemetry row, or citation UI can truthfully expose those fields today.

## Evidence-Based Support Classification

### Supported today

1. Markdown section-level structural locators.
2. PowerShell declaration-level locators with explicit symbol names.
3. JavaScript declaration-level locators with explicit symbol names.
4. XML element-level structural locators for `LogEntry` and simple heuristic element splits.
5. PDF page-range locators on the structured page path.

### Fallback-only today

1. Plain text file-level attribution.
2. Flattened historical PDF file-level attribution.

### Unsupported today

1. Universal line-range locators.
2. Universal character-offset locators.
3. Universal page fidelity for all historical PDF rows.
4. AST-precise symbol locators for PowerShell and JavaScript.
5. Stable XPath-like locators for general XML.

## Final Conclusion

The live runtime now preserves explicit structural and declaration provenance
where the extractor can prove it, but it still does not preserve durable
line-level or character-level positional provenance.

The correct planning baseline is therefore:

1. markdown: section-level locator support is real today
2. PowerShell: declaration-level locator support with explicit symbol names is real today
3. JavaScript: declaration-level locator support with explicit symbol names is real today
4. XML: element-level locator support is real today for supported schemas and simple heuristic splits
5. plain text: file-level attribution only
6. PDF: page-range locator support is real only on the structured page path
7. line and character locators remain unsupported until explicitly implemented and tested
