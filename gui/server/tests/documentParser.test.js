import { jest } from "@jest/globals";
import path from "path";
import fs from "fs/promises";
import os from "os";
import crypto from "crypto";
import { DocumentParser, ManifestEntry } from "../lib/documentParser.js";

describe("DocumentParser", () => {
  let tempDir;
  let collectionName = "TestCollection";
  let parser;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-parser-test-"));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    parser = new DocumentParser(tempDir, collectionName);
  });

  describe("Manifest Persistence", () => {
    it("should save and load manifest correctly", async () => {
      parser.addOrUpdate(
        "file1.md",
        "/source/file1.md",
        "HASH123",
        5,
        1024,
        "test-model",
      );

      await parser.save();

      const newParser = new DocumentParser(tempDir, collectionName);
      await newParser.load();

      expect(newParser.count()).toBe(1);
      const entry = newParser.getEntry("File1.MD"); // Test case-insensitive
      expect(entry.ContentHash).toBe("HASH123");
      expect(entry.FileSize).toBe(1024);
      expect(entry.EmbeddingModel).toBe("test-model");
      expect(entry.ChunkCount).toBe(5);
    });

    it("should handle loading when manifest is missing gracefully", async () => {
      const emptyParser = new DocumentParser(tempDir, "NonExistentCol");
      await emptyParser.load();
      expect(emptyParser.count()).toBe(0);
    });

    it("should clear the manifest correctly", async () => {
      parser.addOrUpdate("del.md", "/a", "H", 1, 10, "m");
      await parser.save();
      await parser.clear();

      expect(parser.count()).toBe(0);

      const newParser = new DocumentParser(tempDir, collectionName);
      await newParser.load();
      expect(newParser.count()).toBe(0);
    });
  });

  describe("CRUD and Orphans", () => {
    it("should add, get, and update entries", () => {
      parser.addOrUpdate("test.txt", "/test.txt", "ABC", 1, 100, "m1");
      expect(parser.count()).toBe(1);

      parser.addOrUpdate("test.txt", "/test.txt", "DEF", 2, 200, "m2");
      expect(parser.count()).toBe(1);

      const entry = parser.getEntry("test.txt");
      expect(entry.ContentHash).toBe("DEF");
    });

    it("should remove entries safely", () => {
      parser.addOrUpdate("a.txt", "/a", "1", 1, 1, "m");
      parser.remove("A.TXT");
      expect(parser.count()).toBe(0);
    });

    it("should check if unchanged", () => {
      parser.addOrUpdate("a.txt", "/a", "HASH", 1, 1, "m");
      expect(parser.isUnchanged("a.txt", "HASH")).toBe(true);
      expect(parser.isUnchanged("a.txt", "DIFFERENT")).toBe(false);
      expect(parser.isUnchanged("missing.txt", "HASH")).toBe(false);
    });

    it("should find by hash", () => {
      parser.addOrUpdate("a.txt", "/a", "HASH_A", 1, 1, "m");
      expect(parser.findByHash("HASH_A").FileName).toBe("a.txt");
      expect(parser.findByHash("MISSING")).toBeNull();
    });

    it("should identify orphan files", () => {
      parser.addOrUpdate("file_active.md", "/f", "1", 1, 1, "m");
      parser.addOrUpdate("file_deleted.md", "/f", "2", 1, 1, "m");

      const orphans = parser.getOrphans(["file_active.md", "new_file.md"]);
      expect(orphans).toEqual(["file_deleted.md"]);
    });
  });

  describe("Static Utilities", () => {
    it("should calculate correct SHA256 file hash", async () => {
      const filePath = path.join(tempDir, "hash_test.txt");
      const content = "Hello World";
      await fs.writeFile(filePath, content);

      const expectedHash = crypto
        .createHash("sha256")
        .update(content)
        .digest("hex")
        .toUpperCase();

      const actualHash = await DocumentParser.getFileHash(filePath);
      expect(actualHash).toBe(expectedHash);
    });

    it("should scan directory filtering by extensions", async () => {
      const scanDir = path.join(tempDir, "scan_test");
      await fs.mkdir(scanDir);

      await fs.writeFile(path.join(scanDir, "test1.md"), "t");
      await fs.writeFile(path.join(scanDir, "test2.TXT"), "t");
      await fs.writeFile(path.join(scanDir, "ignored.json"), "t");

      const nestedDir = path.join(scanDir, "sub");
      await fs.mkdir(nestedDir);
      await fs.writeFile(path.join(nestedDir, "test3.md"), "t");

      const results = await DocumentParser.scanDirectory(scanDir, [
        ".md",
        ".txt",
      ]);
      expect(results.length).toBe(3);

      const fileNames = results.map((r) => path.basename(r).toLowerCase());
      expect(fileNames).toContain("test1.md");
      expect(fileNames).toContain("test2.txt");
      expect(fileNames).toContain("test3.md");
      expect(fileNames).not.toContain("ignored.json");
    });
  });
});
