import path from "path";

class SmartChunk {
  constructor(text, headerContext, level = 0) {
    this.text = text;
    this.headerContext = headerContext;
    this.level = level;
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

    switch (ext) {
      case ".ps1":
      case ".psm1":
      case ".js":
        return this.splitCode(content, fileName);
      case ".xml":
        return this.splitXml(content, fileName);
      case ".md":
        return this.splitMarkdown(content);
      default:
        // .txt and all others — paragraph-split
        return this.splitPlainText(content, fileName);
    }
  }

  // --- Code Chunker (JS/PS1) ---
  // Splits on top-level function/class keyword boundaries.
  splitCode(content, fileName) {
    if (!content || !content.trim()) return [];
    content = content.replace(/\r\n/g, "\n");

    const chunks = [];

    // Match top-level function/class/const/let declarations
    const pattern = /^(?:function|class|const|let)\s+/gm;
    let match;
    const matches = [];
    while ((match = pattern.exec(content)) !== null) {
      matches.push({ index: match.index, length: match[0].length });
    }

    if (matches.length === 0) {
      // No function boundaries found — fall back to plain text
      return this.splitPlainText(content, fileName);
    }

    // Capture any content before the first function (imports, comments, etc.)
    if (matches[0].index > 0) {
      const preamble = content.substring(0, matches[0].index).trim();
      if (preamble.length > 0) {
        this.processSection(preamble, `${fileName} > Preamble`, chunks);
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

      this.processSection(section, context, chunks);
    }

    return chunks;
  }

  // --- XML Chunker ---
  // Splits on top-level element boundaries.
  splitXml(content, fileName) {
    if (!content || !content.trim()) return [];
    content = content.replace(/\r\n/g, "\n");

    const chunks = [];

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
      return this.splitPlainText(content, fileName);
    }

    let lastEnd = 0;
    for (const m of matches) {
      const elementEnd = m.index + m.length;
      const section = content.substring(lastEnd, elementEnd).trim();

      if (section.length > 0) {
        const context = `${fileName} > <${m.tag}>`;
        this.processSection(section, context, chunks);
      }
      lastEnd = elementEnd;
    }

    // Any trailing content after last closing tag
    if (lastEnd < content.length) {
      const trailing = content.substring(lastEnd).trim();
      if (trailing.length > 0) {
        this.processSection(trailing, `${fileName} > Trailing`, chunks);
      }
    }

    return chunks;
  }

  // --- Plain Text Chunker ---
  // Paragraph-split for .txt and unknown file types.
  splitPlainText(content, fileName) {
    if (!content || !content.trim()) return [];
    content = content.replace(/\r\n/g, "\n");

    const chunks = [];
    this.processSection(content, fileName, chunks);
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
        this.processSection(preamble, "Introduction", chunks);
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
      this.processSection(finalText, pathStr, chunks);
    }

    // Fallback if no headers were found
    if (sections.length === 0) {
      this.processSection(text, "Markdown Document", chunks);
    }

    return chunks;
  }

  // --- Core Section Processor (with overlap + sentence-aware splitting) ---
  processSection(text, context, chunks) {
    text = text.trim();
    if (!text) return;

    // Fits in one chunk — emit directly
    if (text.length <= this.maxChunkSize) {
      chunks.push(new SmartChunk(text, context));
      return;
    }

    // Section exceeds maxChunkSize — split with sentence-awareness and overlap
    const paragraphs = text.split(/\n\n+/);
    let current = "";

    for (let para of paragraphs) {
      para = para.trim();
      if (!para) continue;

      if (current.length + para.length + 2 > this.maxChunkSize) {
        // Emit current chunk if non-empty
        if (current.length > 0) {
          chunks.push(new SmartChunk(current, context));

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
              new SmartChunk(para.substring(start, splitAt), context),
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
      chunks.push(new SmartChunk(current, context));
    }
  }
}

export { SmartChunk, SmartTextChunker };
