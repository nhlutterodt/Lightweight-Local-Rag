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
    it("should route powershell files to splitPowerShell", () => {
      const spy = jest.spyOn(chunker, "splitPowerShell").mockReturnValue([]);
      chunker.dispatchByExtension("test.ps1", "function a() {}");
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("should route js files to splitJavaScript", () => {
      const spy = jest.spyOn(chunker, "splitJavaScript").mockReturnValue([]);
      chunker.dispatchByExtension("test.js", "function a() {}");
      expect(spy).toHaveBeenCalledTimes(1);
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

  describe("JavaScript Chunker", () => {
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

      const chunks = chunker.splitJavaScript(code, "test.js");
      expect(chunks.length).toBe(4);
      expect(chunks[0].headerContext).toBe("test.js > Preamble");
      expect(chunks[1].headerContext).toBe("test.js > a");
      expect(chunks[2].headerContext).toBe("test.js > hello");
      expect(chunks[3].headerContext).toBe("test.js > World");
      expect(chunks[1].chunkType).toBe("javascript-block");
      expect(chunks[1].fileType).toBe("javascript");
    });

    it("should fallback to plain text if no code boundaries exist", () => {
      const code = `window.alert("Hello"); console.log("Test");`;
      const spy = jest.spyOn(chunker, "splitPlainText");
      chunker.splitJavaScript(code, "test.js");
      expect(spy).toHaveBeenCalled();
    });

    it("should handle empty or whitespace-only code", () => {
      expect(chunker.splitJavaScript("", "test.js")).toEqual([]);
      expect(chunker.splitJavaScript("   \n", "test.js")).toEqual([]);
    });
  });

  describe("PowerShell Chunker", () => {
    it("should split powershell scripts by param/function/class/filter boundaries", () => {
      const ps = `
param(
  [string]$Name
)

function Get-Thing {
  param([string]$Input)
  return $Input
}

class Worker {
  [string] Run() { return "ok" }
}

filter Normalize-Value {
  $_.Trim()
}
      `.trim();

      const chunks = chunker.splitPowerShell(ps, "test.ps1");
      const contexts = chunks.map((c) => c.headerContext);

      expect(contexts).toContain("test.ps1 > param");
      expect(contexts).toContain("test.ps1 > function:Get-Thing");
      expect(contexts).toContain("test.ps1 > class:Worker");
      expect(contexts).toContain("test.ps1 > filter:Normalize-Value");
      expect(chunks.every((c) => c.fileType === "powershell")).toBe(true);
    });

    it("should fallback to plain text when no declaration boundaries are found", () => {
      const ps = `$value = "hello"`;
      const spy = jest.spyOn(chunker, "splitPlainText");
      chunker.splitPowerShell(ps, "test.ps1");
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("XML Chunker", () => {
    it("should split PowerShell log XML by LogEntry blocks", () => {
      const xml = `<PowerShellLog><LogEntry timestamp="1"><Message>A</Message></LogEntry><LogEntry timestamp="2"><Message>B</Message></LogEntry></PowerShellLog>`;

      const chunks = chunker.splitXml(xml, "test.xml");

      expect(chunks.length).toBe(2);
      expect(chunks[0].headerContext).toBe("test.xml > LogEntry:0");
      expect(chunks[1].headerContext).toBe("test.xml > LogEntry:1");
      expect(chunks[0].chunkType).toBe("xml-logentry");
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
      expect(chunks[0].fileType).toBe("text");
      expect(chunks[0].chunkType).toBe("text-block");
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

    it("should keep fenced code blocks cohesive when splitting sections", () => {
      const smallChunker = new SmartTextChunker(80, 10);
      const md = `
# Intro

Paragraph before code.

    \`\`\`powershell
Get-Process

Get-Service
    \`\`\`

Paragraph after code.
      `.trim();

      const chunks = smallChunker.splitMarkdown(md);
      const codeChunk = chunks.find((chunk) => chunk.text.includes("```powershell"));

      expect(codeChunk).toBeDefined();
      expect(codeChunk.text).toContain("Get-Process");
      expect(codeChunk.text).toContain("Get-Service");
      expect(codeChunk.chunkType).toBe("markdown-section");
      expect(codeChunk.fileType).toBe("markdown");
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
