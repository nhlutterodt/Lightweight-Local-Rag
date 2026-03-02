import { jest } from "@jest/globals";
import { SmartChunk, SmartTextChunker } from "../lib/smartChunker.js";

describe("SmartTextChunker", () => {
  let chunker;

  beforeEach(() => {
    // Small max size to easily test chunk splitting logic
    chunker = new SmartTextChunker(100, 20);
  });

  describe("Token Estimation", () => {
    it("should estimate tokens accurately", () => {
      expect(SmartTextChunker.estimateTokens(null)).toBe(0);
      expect(SmartTextChunker.estimateTokens("")).toBe(0);
      expect(SmartTextChunker.estimateTokens("1234")).toBe(1);
      expect(
        SmartTextChunker.estimateTokens(
          "A very long sentence taking up space.",
        ),
      ).toBe(9);
    });
  });

  describe("Sentence Boundary Detection", () => {
    it("should find sentence boundaries near the end", () => {
      // "Hello world. This is a test."
      // Let's set maxPos = 15, which is after "Hello world."
      const text = "Hello world. This is a test. Another sentence!";
      const bound = SmartTextChunker.findSentenceBoundary(text, 15);
      expect(bound).toBe(13); // Index 12 is '.', so it returns 13
    });

    it("should fallback to spaces if no punctuation is found", () => {
      const text = "word word word word word";
      const bound = SmartTextChunker.findSentenceBoundary(text, 12);
      // Index 12 is "r" in the 3rd "word". Space is at index 9.
      expect(text.substring(0, bound)).toBe("word word ");
    });

    it("should return maxPos if no spaces or punctuation found", () => {
      const text = "supercalifragilisticexpialidocious";
      const bound = SmartTextChunker.findSentenceBoundary(text, 15);
      expect(bound).toBe(15);
    });
  });

  describe("File-Type Dispatching", () => {
    it("should route powershell and js files to splitCode", () => {
      const spy = jest.spyOn(chunker, "splitCode").mockReturnValue([]);
      chunker.dispatchByExtension("test.ps1", "function a() {}");
      chunker.dispatchByExtension("test.js", "function a() {}");
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("should route xml files to splitXml", () => {
      const spy = jest.spyOn(chunker, "splitXml").mockReturnValue([]);
      chunker.dispatchByExtension("data.xml", "<test></test>");
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("should route markdown files to splitMarkdown", () => {
      const spy = jest.spyOn(chunker, "splitMarkdown").mockReturnValue([]);
      chunker.dispatchByExtension("doc.md", "# Header");
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("should fallback to splitPlainText for unknown formats", () => {
      const spy = jest.spyOn(chunker, "splitPlainText").mockReturnValue([]);
      chunker.dispatchByExtension("notes.txt", "Some text");
      chunker.dispatchByExtension("data.csv", "1,2,3");
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe("Code Chunker", () => {
    it("should split code by function boundaries", () => {
      const code = `
// Preamble comments
const a = 1;
function hello() {
  return true;
}
class World {
  method() {}
}
      `.trim();

      const chunks = chunker.splitCode(code, "test.js");
      expect(chunks.length).toBe(4);
      expect(chunks[0].headerContext).toBe("test.js > Preamble");
      expect(chunks[1].headerContext).toBe("test.js > a");
      expect(chunks[2].headerContext).toBe("test.js > hello");
      expect(chunks[3].headerContext).toBe("test.js > World");
    });

    it("should fallback to plain text if no code boundaries exist", () => {
      const code = `window.alert("Hello"); console.log("Test");`;
      const spy = jest.spyOn(chunker, "splitPlainText");
      chunker.splitCode(code, "test.js");
      expect(spy).toHaveBeenCalled();
    });

    it("should handle empty or whitespace-only code", () => {
      expect(chunker.splitCode("", "test.js")).toEqual([]);
      expect(chunker.splitCode("   \n", "test.js")).toEqual([]);
    });
  });

  describe("XML Chunker", () => {
    it("should split XML by closing tags", () => {
      const xml = `<root>\n<item>1</item>\n<item>2</item>\n</root>`;

      const chunks = chunker.splitXml(xml, "test.xml");

      expect(chunks.length).toBe(3);
      expect(chunks[0].headerContext).toBe("test.xml > <item>");
      expect(chunks[1].headerContext).toBe("test.xml > <item>");
      expect(chunks[2].headerContext).toBe("test.xml > <root>");
    });

    it("should chunk remaining text as trailing context", () => {
      const xml = `<root>\n<item>1</item>\n</root>\nSome trailing text here.`;
      const chunks = chunker.splitXml(xml, "test.xml");
      expect(chunks.length).toBe(3);
      expect(chunks[2].headerContext).toBe("test.xml > Trailing");
    });

    it("should fallback to plain text if 1 or 0 closing tags", () => {
      const spy = jest.spyOn(chunker, "splitPlainText").mockReturnValue([]);
      chunker.splitXml(`<root>Just simple text</root>`, "test.xml");
      expect(spy).toHaveBeenCalled();
    });

    it("should handle empty xml", () => {
      expect(chunker.splitXml("", "test.xml")).toEqual([]);
    });
  });

  describe("Plain Text Chunker", () => {
    it("should process plain text into chunks", () => {
      const chunks = chunker.splitPlainText("Hello world", "test.txt");
      expect(chunks.length).toBe(1);
      expect(chunks[0].headerContext).toBe("test.txt");
      expect(chunks[0].text).toBe("Hello world");
    });

    it("should handle empty text", () => {
      expect(chunker.splitPlainText("  ", "test")).toEqual([]);
    });
  });

  describe("Markdown Chunker", () => {
    it("should chunk markdown retaining hierarchical header context", () => {
      const md = `
Intro preamble text.
# Header 1
Body 1
## Header 2
Body 2
# Header 3
Body 3
      `.trim();

      const chunks = chunker.splitMarkdown(md);
      expect(chunks.length).toBe(4);
      expect(chunks[0].headerContext).toBe("Introduction");
      expect(chunks[1].headerContext).toBe("Header 1");
      expect(chunks[2].headerContext).toBe("Header 1 > Header 2");
      expect(chunks[3].headerContext).toBe("Header 3");
    });

    it("should fallback to plain text if no headers found", () => {
      const md = `Just a long text without markdown headers.`;
      const chunks = chunker.splitMarkdown(md);
      expect(chunks.length).toBe(1);
      expect(chunks[0].headerContext).toBe("Markdown Document");
    });

    it("should handle empty text", () => {
      expect(chunker.splitMarkdown("  ")).toEqual([]);
    });
  });

  describe("Process Section (Overlaps & Splitting)", () => {
    it("should split content correctly by paragraphs and sentences if too long", () => {
      // Chunk size is 100, overlap is 20
      const chunker = new SmartTextChunker(50, 10);
      const text =
        "Paragraph 1 is here.\n\nParagraph 2 is slightly longer. It has multiple sentences to test boundaries.";

      const chunks = [];
      chunker.processSection(text, "context", chunks);

      // Expected to split because paragraph 2 is > 50 chars.
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].text).toContain("Paragraph 1");
    });

    it("should not process empty sections", () => {
      const chunks = [];
      chunker.processSection("   \n", "ctx", chunks);
      expect(chunks.length).toBe(0);
    });

    it("should correctly handle single paragraph exceeding maxChunkSize with overlap", () => {
      // Very small chunker to force split inside a single wordy paragraph
      const smallChunker = new SmartTextChunker(20, 5);
      const text = "Averylongwordthatdoesnothavespacesorpuncuations!!!";

      const chunks = [];
      smallChunker.processSection(text, "ctx", chunks);

      // Max size: 20. Overlap: 5.
      // First split is at 19 ("Averylongwordthatdo").
      // Overlap starts 5 chars before -> "hatdo".
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].text.length).toBeLessThanOrEqual(20);
      expect(chunks[1].text.startsWith("hatdo")).toBe(true);
    });
  });
});
