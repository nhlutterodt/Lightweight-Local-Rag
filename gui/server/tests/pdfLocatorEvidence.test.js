import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jest } from "@jest/globals";
import PDFParser from "pdf2json";
import { SmartTextChunker } from "../lib/smartChunker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safeDecode(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

function normalize(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyChunkAgainstPages(chunkText, pageTexts) {
  const normalizedChunk = normalize(chunkText);
  const prefix = normalizedChunk.slice(0, 160);
  const suffix = normalizedChunk.slice(-160);

  const prefixHits = pageTexts
    .filter((page) => prefix.length > 0 && page.text.includes(prefix))
    .map((page) => page.page);
  const suffixHits = pageTexts
    .filter((page) => suffix.length > 0 && page.text.includes(suffix))
    .map((page) => page.page);

  const firstPrefix = prefixHits[0] || null;
  const firstSuffix = suffixHits[0] || null;

  if (firstPrefix && firstSuffix) {
    return {
      classification:
        firstPrefix === firstSuffix ? "single-page" : "cross-page-range",
      firstPrefix,
      firstSuffix,
    };
  }

  if (firstPrefix || firstSuffix) {
    return {
      classification: "partial-match-only",
      firstPrefix,
      firstSuffix,
    };
  }

  return {
    classification: "no-match",
    firstPrefix,
    firstSuffix,
  };
}

async function parsePdf(samplePdfPath) {
  const buffer = fs.readFileSync(samplePdfPath);
  const pdfParser = new PDFParser(null, 1);

  const pdfData = await new Promise((resolve, reject) => {
    pdfParser.on("pdfParser_dataError", (err) =>
      reject(err?.parserError || err),
    );
    pdfParser.on("pdfParser_dataReady", (data) => resolve(data));
    pdfParser.parseBuffer(buffer);
  });

  return { pdfData, pdfParser };
}

describe("PDF locator evidence barrier", () => {
  const samplePdfPath = path.resolve(
    __dirname,
    "../../../ingest_data/pdf_test/Publishing an App to the Google Play Store.pdf",
  );

  let warnSpy;
  let logSpy;
  let originalDisableLogs;

  beforeAll(() => {
    jest.setTimeout(30000);
    originalDisableLogs = process.env.PDF2JSON_DISABLE_LOGS;
    process.env.PDF2JSON_DISABLE_LOGS = "1";
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterAll(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    if (originalDisableLogs === undefined) {
      delete process.env.PDF2JSON_DISABLE_LOGS;
    } else {
      process.env.PDF2JSON_DISABLE_LOGS = originalDisableLogs;
    }
  });

  it("shows flattened PDF chunks cannot be assigned to pages reliably after extraction", async () => {
    expect(fs.existsSync(samplePdfPath)).toBe(true);

    const { pdfData, pdfParser } = await parsePdf(samplePdfPath);

    const flattenedText = pdfParser.getRawTextContent();
    const chunker = new SmartTextChunker(1000, 200);
    const chunks = chunker.dispatchByExtension(samplePdfPath, flattenedText);
    const pageTexts = (pdfData.Pages || []).map((page, index) => ({
      page: index + 1,
      text: normalize(
        (page.Texts || [])
          .flatMap((textBlock) =>
            (textBlock.R || []).map((run) => safeDecode(run.T)),
          )
          .join(" "),
      ),
    }));

    expect(pageTexts.length).toBeGreaterThan(1);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.locatorType === "none")).toBe(true);

    const classifications = chunks.map((chunk) =>
      classifyChunkAgainstPages(chunk.text, pageTexts),
    );
    const singlePageCount = classifications.filter(
      (item) => item.classification === "single-page",
    ).length;
    const crossPageCount = classifications.filter(
      (item) => item.classification === "cross-page-range",
    ).length;
    const partialOnlyCount = classifications.filter(
      (item) => item.classification === "partial-match-only",
    ).length;

    // Regression barrier: with the current getRawTextContent() -> plain-text
    // chunking path, page assignment is not reliable enough to support a
    // truthful page locator contract.
    expect(singlePageCount).toBeLessThan(chunks.length);
    expect(crossPageCount).toBeGreaterThan(0);
    expect(partialOnlyCount).toBeGreaterThan(0);
  });

  it("prototype page-bounded chunking keeps every pdf chunk on one page", async () => {
    expect(fs.existsSync(samplePdfPath)).toBe(true);

    const { pdfData } = await parsePdf(samplePdfPath);
    const chunker = new SmartTextChunker(1000, 200);
    const chunks = chunker.dispatchByExtension(samplePdfPath, pdfData);
    const pageTexts = (pdfData.Pages || []).map((page, index) => ({
      page: index + 1,
      text: normalize(
        (page.Texts || [])
          .flatMap((textBlock) =>
            (textBlock.R || []).map((run) => safeDecode(run.T)),
          )
          .join(" "),
      ),
    }));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.locatorType === "page-range")).toBe(true);
    expect(chunks.every((chunk) => Number.isInteger(chunk.pageStart))).toBe(true);
    expect(chunks.every((chunk) => chunk.pageStart === chunk.pageEnd)).toBe(true);

    const crossPageCount = chunks
      .map((chunk) => classifyChunkAgainstPages(chunk.text, pageTexts))
      .filter((item) => item.classification === "cross-page-range").length;

    expect(crossPageCount).toBe(0);
  });
});