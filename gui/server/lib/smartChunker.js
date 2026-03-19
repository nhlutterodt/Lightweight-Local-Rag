import path from "path";

class SmartChunk {
  constructor(
    text,
    headerContext,
    level = 0,
    chunkType = "content",
    fileType = "unknown",
    structuralPath = null,
    locatorType = "none",
    metadata = {},
  ) {
    this.text = text;
    this.headerContext = headerContext;
    this.level = level;
    this.chunkType = chunkType;
    this.fileType = fileType;
    this.structuralPath = structuralPath || headerContext;
    this.locatorType = locatorType || "none";
    Object.assign(this, metadata);
  }
}

class SmartTextChunker {
  constructor(maxSize, overlap = 200) {
    this.maxChunkSize = maxSize;
    this.overlap = overlap;
  }

  // --- Token Estimation ---
  static estimateTokens(text) {
    if (!text) return 0;
    return Math.floor(text.length / 4);
  }

  static deriveFileType(ext) {
    switch (ext) {
      case ".md":
        return "markdown";
      case ".pdf":
        return "pdf";
      case ".ps1":
      case ".psm1":
        return "powershell";
      case ".js":
        return "javascript";
      case ".xml":
        return "xml";
      case ".txt":
        return "text";
      default:
        return "text";
    }
  }

  // --- Sentence Boundary Detection ---
  // Scans backward from maxPos to find a sentence-ending character (.?!\n),
  // or falls back to last space. Prevents mid-word/mid-sentence cuts.
  static findSentenceBoundary(text, maxPos) {
    const searchStart = Math.max(0, Math.floor(maxPos * 0.8)); // 20% tolerance window

    for (let i = maxPos; i >= searchStart; i--) {
      const ch = text[i];
      if (ch === "." || ch === "?" || ch === "!" || ch === "\n") {
        return i + 1;
      }
    }

    // Fallback: last space
    for (let i = maxPos; i >= searchStart; i--) {
      if (text[i] === " ") {
        return i + 1;
      }
    }

    return maxPos;
  }

  // --- File-Type Dispatching ---
  // Routes content to the appropriate chunking strategy based on file extension.
  dispatchByExtension(filePath, content) {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const fileType = SmartTextChunker.deriveFileType(ext);

    switch (ext) {
      case ".pdf":
        return this.splitPdfDocument(content, fileName);
      case ".ps1":
      case ".psm1":
        return this.splitPowerShell(content, fileName);
      case ".js":
        return this.splitJavaScript(content, fileName);
      case ".xml":
        return this.splitXml(content, fileName);
      case ".md":
        return this.splitMarkdown(content);
      default:
        // .txt and all others — paragraph-split
        return this.splitPlainText(content, fileName, fileType);
    }
  }

  static decodePdfTextRun(value) {
    try {
      return decodeURIComponent(value || "");
    } catch {
      return value || "";
    }
  }

  static extractPdfPageText(page) {
    if (!page || !Array.isArray(page.Texts)) {
      return "";
    }

    return page.Texts.map((textBlock) =>
      (textBlock?.R || [])
        .map((run) => SmartTextChunker.decodePdfTextRun(run?.T))
        .join(""),
    )
      .join("\n")
      .trim();
  }

  splitPdfDocument(pdfData, fileName) {
    if (!pdfData) return [];

    if (typeof pdfData === "string") {
      return this.splitPlainText(pdfData, fileName, "pdf");
    }

    const pages = Array.isArray(pdfData.Pages) ? pdfData.Pages : [];
    if (pages.length === 0) {
      return [];
    }

    const chunks = [];

    for (let index = 0; index < pages.length; index += 1) {
      const pageNumber = index + 1;
      const pageText = SmartTextChunker.extractPdfPageText(pages[index]);
      if (!pageText) {
        continue;
      }

      const context = `${fileName} > Page ${pageNumber}`;
      this.processSection(pageText, context, chunks, {
        fileType: "pdf",
        chunkType: "pdf-page",
        structuralPath: context,
        locatorType: "page-range",
        chunkMetadata: {
          pageStart: pageNumber,
          pageEnd: pageNumber,
        },
      });
    }

    return chunks;
  }

  // --- Code Chunker (JS) ---
  // Splits on top-level function/class keyword boundaries.
  splitJavaScript(content, fileName) {
    if (!content || !content.trim()) return [];
    content = content.replace(/\r\n/g, "\n");

    const chunks = [];

    // Match top-level function/class/const/let declarations
    const pattern = /^\s*(?:function|class|const|let)\s+/gm;
    let match;
    const matches = [];
    while ((match = pattern.exec(content)) !== null) {
      matches.push({ index: match.index, length: match[0].length });
    }

    if (matches.length === 0) {
      // No function boundaries found — fall back to plain text
      return this.splitPlainText(content, fileName, "javascript");
    }

    // Capture any content before the first function (imports, comments, etc.)
    if (matches[0].index > 0) {
      const preamble = content.substring(0, matches[0].index).trim();
      if (preamble.length > 0) {
        this.processSection(preamble, `${fileName} > Preamble`, chunks, {
          fileType: "javascript",
          chunkType: "javascript-preamble",
          structuralPath: `${fileName} > Preamble`,
          locatorType: "declaration",
        });
      }
    }

    // Each function boundary to the next
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end =
        i + 1 < matches.length ? matches[i + 1].index : content.length;
      const section = content.substring(start, end).trim();

      // Extract function/class name for context
      const nameMatch = section.match(
        /^(?:function|class|const|let)\s+([^\s{(]+)/,
      );
      const name = nameMatch ? nameMatch[1] : `Block_${i}`;
      const context = `${fileName} > ${name}`;

      this.processSection(section, context, chunks, {
        fileType: "javascript",
        chunkType: "javascript-block",
        structuralPath: context,
        locatorType: "declaration",
      });
    }

    return chunks;
  }

  // --- PowerShell Chunker ---
  // Splits on param/function/class/filter boundaries and attempts to keep
  // comment-based help attached to the following declaration.
  splitPowerShell(content, fileName) {
    if (!content || !content.trim()) return [];
    content = content.replace(/\r\n/g, "\n");

    const chunks = [];
    const boundaries = [];

    const paramMatch = /^(?:\s*#.*\n|\s*<#[\s\S]*?#>\s*)*\s*param\s*\(/i.exec(
      content,
    );
    if (paramMatch && paramMatch.index === 0) {
      const paramOffset = paramMatch[0].toLowerCase().lastIndexOf("param");
      boundaries.push({ index: Math.max(0, paramOffset), kind: "param", name: "param" });
    }

    const declRegex = /^\s*(function|class|filter)\s+([^\s{(]+)/gim;
    let declMatch;
    while ((declMatch = declRegex.exec(content)) !== null) {
      boundaries.push({
        index: declMatch.index,
        kind: declMatch[1].toLowerCase(),
        name: declMatch[2],
      });
    }

    if (boundaries.length === 0) {
      return this.splitPlainText(content, fileName, "powershell");
    }

    boundaries.sort((left, right) => left.index - right.index);

    if (boundaries[0].index > 0) {
      const preamble = content.substring(0, boundaries[0].index).trim();
      if (preamble.length > 0) {
        this.processSection(preamble, `${fileName} > Preamble`, chunks, {
          fileType: "powershell",
          chunkType: "powershell-preamble",
          structuralPath: `${fileName} > Preamble`,
          locatorType: "declaration",
        });
      }
    }

    for (let i = 0; i < boundaries.length; i++) {
      let start = boundaries[i].index;
      const end =
        i + 1 < boundaries.length ? boundaries[i + 1].index : content.length;

      // Pull in a trailing comment-based help block if it sits directly above the declaration.
      const prior = content.substring(0, start);
      const helpMatch = prior.match(/<#[\s\S]*?#>\s*$/);
      if (helpMatch) {
        start = Math.max(0, prior.length - helpMatch[0].length);
      }

      const section = content.substring(start, end).trim();
      if (!section) continue;

      const item = boundaries[i];
      const label = item.kind === "param" ? "param" : `${item.kind}:${item.name}`;
      const context = `${fileName} > ${label}`;

      this.processSection(section, context, chunks, {
        fileType: "powershell",
        chunkType:
          item.kind === "param"
            ? "powershell-param-block"
            : `powershell-${item.kind}`,
        structuralPath: context,
        locatorType: "declaration",
      });
    }

    return chunks;
  }

  // --- XML Chunker ---
  // Splits on top-level element boundaries.
  splitXml(content, fileName) {
    if (!content || !content.trim()) return [];
    content = content.replace(/\r\n/g, "\n");

    const chunks = [];

    // PowerShell log schema: preserve each LogEntry as its own chunk.
    if (/<PowerShellLog\b/i.test(content) && /<LogEntry\b/i.test(content)) {
      const entryRegex = /<LogEntry\b[\s\S]*?<\/LogEntry>/gi;
      let entryMatch;
      let index = 0;

      while ((entryMatch = entryRegex.exec(content)) !== null) {
        const entry = entryMatch[0].trim();
        if (!entry) continue;

        const context = `${fileName} > LogEntry:${index}`;
        this.processSection(entry, context, chunks, {
          fileType: "xml",
          chunkType: "xml-logentry",
          structuralPath: "PowerShellLog > LogEntry",
          locatorType: "xml-element",
        });
        index += 1;
      }

      if (chunks.length > 0) {
        return chunks;
      }
    }

    // Match closing tags of top-level elements (simple heuristic)
    const pattern = /<\/(\w+)>/g;
    let match;
    const matches = [];
    while ((match = pattern.exec(content)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        tag: match[1],
      });
    }

    if (matches.length <= 1) {
      // Single root element or no structure — treat as plain text
      return this.splitPlainText(content, fileName, "xml");
    }

    let lastEnd = 0;
    for (const m of matches) {
      const elementEnd = m.index + m.length;
      const section = content.substring(lastEnd, elementEnd).trim();

      if (section.length > 0) {
        const context = `${fileName} > <${m.tag}>`;
        this.processSection(section, context, chunks, {
          fileType: "xml",
          chunkType: "xml-element",
          structuralPath: `<${m.tag}>`,
          locatorType: "xml-element",
        });
      }
      lastEnd = elementEnd;
    }

    // Any trailing content after last closing tag
    if (lastEnd < content.length) {
      const trailing = content.substring(lastEnd).trim();
      if (trailing.length > 0) {
        this.processSection(trailing, `${fileName} > Trailing`, chunks, {
          fileType: "xml",
          chunkType: "xml-trailing",
          structuralPath: `${fileName} > Trailing`,
          locatorType: "none",
        });
      }
    }

    return chunks;
  }

  // --- Plain Text Chunker ---
  // Paragraph-split for .txt and unknown file types.
  splitPlainText(content, fileName, fileType = "text") {
    if (!content || !content.trim()) return [];
    content = content.replace(/\r\n/g, "\n");

    const chunks = [];
    this.processSection(content, fileName, chunks, {
      fileType,
      chunkType: "text-block",
      structuralPath: fileName,
      locatorType: "none",
    });
    return chunks;
  }

  // --- Markdown Chunker ---
  splitMarkdown(text) {
    if (!text || !text.trim()) return [];
    text = text.replace(/\r\n/g, "\n");

    const chunks = [];

    // Split on header boundaries (# Header)
    const headerRegex = /^(#+)\s+(.*)$/gm;
    let match;
    let lastIndex = 0;

    // Check if there is a preamble before the first header
    match = headerRegex.exec(text);
    if (match && match.index > 0) {
      const preamble = text.substring(0, match.index).trim();
      if (preamble) {
        this.processSection(preamble, "Introduction", chunks, {
          fileType: "markdown",
          chunkType: "markdown-preamble",
          structuralPath: "Introduction",
          locatorType: "section",
        });
      }
    }

    // Reset regex index if we found a match
    if (match) {
      headerRegex.lastIndex = match.index;
    }

    const sections = [];
    while ((match = headerRegex.exec(text)) !== null) {
      sections.push({
        level: match[1].length,
        title: match[2].trim(),
        index: match.index,
        matchLength: match[0].length,
      });
    }

    const headerStack = [];

    for (let i = 0; i < sections.length; i++) {
      const current = sections[i];
      const startBody = current.index + current.matchLength;
      const endBody =
        i + 1 < sections.length ? sections[i + 1].index : text.length;

      const bodyText = text.substring(startBody, endBody).trim();
      const level = current.level;

      // Adjust stack based on header level
      while (headerStack.length > 0) {
        const last = headerStack[headerStack.length - 1];
        if (last.level >= level) {
          headerStack.pop();
        } else {
          break;
        }
      }

      headerStack.push({ level: level, title: current.title });

      // Build path string mapping the headers logically
      const pathStr = headerStack.map((h) => h.title).join(" > ");

      const finalText = `${"#".repeat(level)} ${current.title}\n${bodyText}`;
      this.processSection(finalText, pathStr, chunks, {
        level,
        fileType: "markdown",
        chunkType: "markdown-section",
        structuralPath: pathStr,
        locatorType: "section",
      });
    }

    // Fallback if no headers were found
    if (sections.length === 0) {
      this.processSection(text, "Markdown Document", chunks, {
        fileType: "markdown",
        chunkType: "markdown-section",
        structuralPath: "Markdown Document",
        locatorType: "section",
      });
    }

    return chunks;
  }

  // Split by paragraph breaks while preserving fenced code blocks as single units.
  static splitParagraphsPreservingCodeBlocks(text) {
    const lines = text.split("\n");
    const paragraphs = [];
    let buffer = [];
    let inFence = false;

    const flush = () => {
      const value = buffer.join("\n").trim();
      if (value) paragraphs.push(value);
      buffer = [];
    };

    for (const line of lines) {
      if (/^```/.test(line.trim())) {
        inFence = !inFence;
        buffer.push(line);
        continue;
      }

      if (!inFence && line.trim() === "") {
        flush();
        continue;
      }

      buffer.push(line);
    }

    flush();
    return paragraphs;
  }

  // --- Core Section Processor (with overlap + sentence-aware splitting) ---
  processSection(text, context, chunks, metadata = {}) {
    text = text.trim();
    if (!text) return;

    const level = metadata.level || 0;
    const fileType = metadata.fileType || "unknown";
    const chunkType = metadata.chunkType || "content";
    const structuralPath = metadata.structuralPath || context;
    const locatorType = metadata.locatorType || "none";
    const chunkMetadata = metadata.chunkMetadata || {};

    // Fits in one chunk — emit directly
    if (text.length <= this.maxChunkSize) {
      chunks.push(
        new SmartChunk(
          text,
          context,
          level,
          chunkType,
          fileType,
          structuralPath,
          locatorType,
          chunkMetadata,
        ),
      );
      return;
    }

    // Section exceeds maxChunkSize — split with sentence-awareness and overlap
    const paragraphs = SmartTextChunker.splitParagraphsPreservingCodeBlocks(text);
    let current = "";

    for (let para of paragraphs) {
      para = para.trim();
      if (!para) continue;

      if (current.length + para.length + 2 > this.maxChunkSize) {
        // Emit current chunk if non-empty
        if (current.length > 0) {
          chunks.push(
            new SmartChunk(
              current,
              context,
              level,
              chunkType,
              fileType,
              structuralPath,
              locatorType,
              chunkMetadata,
            ),
          );

          let nextPrefix = "";
          // Overlap: carry forward last Overlap chars as prefix for next chunk
          if (this.overlap > 0 && current.length > this.overlap) {
            nextPrefix =
              current.substring(current.length - this.overlap) + "\n\n";
          }
          current = nextPrefix;
        }

        // If single paragraph is still too large, sentence-split it
        if (para.length > this.maxChunkSize) {
          let start = 0;
          while (start < para.length) {
            const remaining = para.length - start;
            if (remaining <= this.maxChunkSize) {
              // Last piece fits as-is
              if (current.length > 0) current += "\n\n";
              current += para.substring(start);
              break;
            }

            let splitAt = SmartTextChunker.findSentenceBoundary(
              para,
              start + this.maxChunkSize - 1,
            );
            if (splitAt <= start) {
              splitAt = start + this.maxChunkSize;
            }

            chunks.push(
              new SmartChunk(
                para.substring(start, splitAt),
                context,
                level,
                chunkType,
                fileType,
                structuralPath,
                locatorType,
                chunkMetadata,
              ),
            );

            // Overlap for sentence-split pieces
            start = Math.max(start + 1, splitAt - this.overlap);
          }
          continue;
        }
      }

      if (current.length > 0) current += "\n\n";
      current += para;
    }

    if (current.length > 0) {
      chunks.push(
        new SmartChunk(
          current,
          context,
          level,
          chunkType,
          fileType,
          structuralPath,
          locatorType,
          chunkMetadata,
        ),
      );
    }
  }
}

export { SmartChunk, SmartTextChunker };
