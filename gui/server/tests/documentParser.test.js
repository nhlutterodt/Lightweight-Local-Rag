import { jest } from "@jest/globals";
import path from "path";
import fs from "fs/promises";
import os from "os";
import crypto from "crypto";
import { DocumentParser, ManifestEntry } from "../lib/documentParser.js";

describe("DocumentParser", () => {
  let tempDir;
  const collectionName = "TestCollection";
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

  // ---------------------------------------------------------------------------
  // Manifest Persistence
  // ---------------------------------------------------------------------------

  describe("Manifest Persistence", () => {
    it("saves and loads manifest entries keyed by sourceId", async () => {
      parser.addOrUpdate(
        "src_abc1234567890123",
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
      const entry = newParser.getEntry("src_abc1234567890123");
      expect(entry).not.toBeNull();
      expect(entry.ContentHash).toBe("HASH123");
      expect(entry.FileSize).toBe(1024);
      expect(entry.EmbeddingModel).toBe("test-model");
      expect(entry.ChunkCount).toBe(5);
      expect(entry.SourceId).toBe("src_abc1234567890123");
    });

    it("handles loading when manifest is missing gracefully", async () => {
      const emptyParser = new DocumentParser(tempDir, "NonExistentCol");
      await emptyParser.load();
      expect(emptyParser.count()).toBe(0);
    });

    it("clears the manifest correctly", async () => {
      parser.addOrUpdate("src_del", "del.md", "/a", "H", 1, 10, "m");
      await parser.save();
      await parser.clear();

      expect(parser.count()).toBe(0);

      const newParser = new DocumentParser(tempDir, collectionName);
      await newParser.load();
      expect(newParser.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // CRUD and Orphans (sourceId-keyed)
  // ---------------------------------------------------------------------------

  describe("CRUD and Orphans", () => {
    it("adds, gets, and updates entries by sourceId", () => {
      parser.addOrUpdate("src_aaa", "test.txt", "/test.txt", "ABC", 1, 100, "m1");
      expect(parser.count()).toBe(1);

      parser.addOrUpdate("src_aaa", "test.txt", "/test.txt", "DEF", 2, 200, "m2");
      expect(parser.count()).toBe(1);

      const entry = parser.getEntry("src_aaa");
      expect(entry.ContentHash).toBe("DEF");
    });

    it("removes entries by sourceId", () => {
      parser.addOrUpdate("src_bbb", "a.txt", "/a", "1", 1, 1, "m");
      parser.remove("src_bbb");
      expect(parser.count()).toBe(0);
    });

    it("getEntryByFileName finds an entry using auxiliary filename lookup", () => {
      parser.addOrUpdate("src_ccc", "needle.md", "/path/needle.md", "H", 1, 1, "m");
      const found = parser.getEntryByFileName("needle.md");
      expect(found).not.toBeNull();
      expect(found.SourceId).toBe("src_ccc");
    });

    it("getEntryByFileName is case-insensitive", () => {
      parser.addOrUpdate("src_ddd", "Doc.MD", "/Doc.MD", "H", 1, 1, "m");
      expect(parser.getEntryByFileName("doc.md")).not.toBeNull();
      expect(parser.getEntryByFileName("DOC.MD")).not.toBeNull();
    });

    it("getEntryByFileName returns null when no entry matches", () => {
      expect(parser.getEntryByFileName("missing.md")).toBeNull();
    });

    it("updateEntry updates FileName and SourcePath in-place while preserving sourceId", () => {
      parser.addOrUpdate("src_eee", "original.md", "/data/original.md", "H", 2, 512, "m");
      parser.updateEntry("src_eee", { FileName: "renamed.md", SourcePath: "/data/renamed.md" });

      const entry = parser.getEntry("src_eee");
      expect(entry.FileName).toBe("renamed.md");
      expect(entry.SourcePath).toBe("/data/renamed.md");
      expect(entry.SourceId).toBe("src_eee");
      expect(entry.ContentHash).toBe("H"); // unchanged
    });

    it("isUnchanged returns true when fileName and contentHash both match an entry", () => {
      parser.addOrUpdate("src_fff", "a.txt", "/a", "HASH", 1, 1, "m");
      expect(parser.isUnchanged("a.txt", "HASH")).toBe(true);
      expect(parser.isUnchanged("a.txt", "DIFFERENT")).toBe(false);
      expect(parser.isUnchanged("missing.txt", "HASH")).toBe(false);
    });

    it("findByHash returns the entry with a matching ContentHash", () => {
      parser.addOrUpdate("src_ggg", "a.txt", "/a", "HASH_A", 1, 1, "m");
      const found = parser.findByHash("HASH_A");
      expect(found).not.toBeNull();
      expect(found.FileName).toBe("a.txt");
      expect(found.SourceId).toBe("src_ggg");
      expect(parser.findByHash("MISSING")).toBeNull();
    });

    it("getOrphans takes a Set of active sourceIds and returns inactive sourceIds", () => {
      parser.addOrUpdate("src_active", "file_active.md", "/f", "1", 1, 1, "m");
      parser.addOrUpdate("src_deleted", "file_deleted.md", "/f", "2", 1, 1, "m");

      const orphanSourceIds = parser.getOrphans(new Set(["src_active"]));
      expect(orphanSourceIds).toEqual(["src_deleted"]);
    });

    it("getOrphans returns empty array when all entries are active", () => {
      parser.addOrUpdate("src_x", "x.md", "/x", "1", 1, 1, "m");
      expect(parser.getOrphans(new Set(["src_x"]))).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Duplicate-basename coexistence (Decision Rule: Option A rejected)
  // ---------------------------------------------------------------------------

  describe("Duplicate-basename coexistence", () => {
    it("two files with the same basename but different sourceIds can coexist", () => {
      parser.addOrUpdate("src_dir1_report", "report.md", "/data/dir1/report.md", "H1", 1, 100, "m");
      parser.addOrUpdate("src_dir2_report", "report.md", "/data/dir2/report.md", "H2", 2, 200, "m");

      expect(parser.count()).toBe(2);
      expect(parser.getEntry("src_dir1_report").SourcePath).toBe("/data/dir1/report.md");
      expect(parser.getEntry("src_dir2_report").SourcePath).toBe("/data/dir2/report.md");
    });

    it("removing one duplicate-basename entry does not affect the other", () => {
      parser.addOrUpdate("src_a_doc", "doc.md", "/a/doc.md", "HA", 1, 1, "m");
      parser.addOrUpdate("src_b_doc", "doc.md", "/b/doc.md", "HB", 1, 1, "m");

      parser.remove("src_a_doc");

      expect(parser.count()).toBe(1);
      expect(parser.getEntry("src_b_doc")).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Static Utilities
  // ---------------------------------------------------------------------------

  describe("Static Utilities", () => {
    it("calculates correct SHA256 file hash", async () => {
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

    it("scans directory filtering by extensions", async () => {
      const scanDir = path.join(tempDir, "scan_test");
      await fs.mkdir(scanDir, { recursive: true });

      await fs.writeFile(path.join(scanDir, "test1.md"), "t");
      await fs.writeFile(path.join(scanDir, "test2.TXT"), "t");
      await fs.writeFile(path.join(scanDir, "ignored.json"), "t");

      const nestedDir = path.join(scanDir, "sub");
      await fs.mkdir(nestedDir);
      await fs.writeFile(path.join(nestedDir, "test3.md"), "t");

      const results = await DocumentParser.scanDirectory(scanDir, [".md", ".txt"]);
      expect(results.length).toBe(3);

      const fileNames = results.map((r) => path.basename(r).toLowerCase());
      expect(fileNames).toContain("test1.md");
      expect(fileNames).toContain("test2.txt");
      expect(fileNames).toContain("test3.md");
      expect(fileNames).not.toContain("ignored.json");
    });
  });

  // ---------------------------------------------------------------------------
  // Schema Migration
  // ---------------------------------------------------------------------------

  describe("Schema Migration", () => {
    async function writeManifest(dir, name, payload) {
      await fs.writeFile(
        path.join(dir, `${name}.manifest.json`),
        JSON.stringify(payload),
        "utf8",
      );
    }

    const v1Entry = {
      FileName: "doc.md",
      SourcePath: "/path/doc.md",
      ContentHash: "ABCD",
      ChunkCount: 1,
      FileSize: 100,
      LastIngested: new Date().toISOString(),
      EmbeddingModel: "test-model",
    };

    it("migrates v1.0 manifest (no Version field) to v2.0 and adds SourceId to entries", async () => {
      const col = "MigLegacy";
      await writeManifest(tempDir, col, { Entries: [v1Entry] });

      const p = new DocumentParser(tempDir, col);
      await p.load();

      expect(p.count()).toBe(1);
      // v2.0 entries are keyed by sourceId — we can find the entry via filename
      const entry = p.getEntryByFileName("doc.md");
      expect(entry).not.toBeNull();
      expect(typeof entry.SourceId).toBe("string");
      expect(entry.SourceId).toMatch(/^src_[0-9a-f]{16}$/);
    });

    it("migrates explicit Version 1.0 manifest to v2.0", async () => {
      const col = "MigV1";
      await writeManifest(tempDir, col, {
        Version: "1.0",
        Collection: col,
        Entries: [v1Entry],
      });

      const p = new DocumentParser(tempDir, col);
      await p.load();

      expect(p.count()).toBe(1);
      const entry = p.getEntryByFileName("doc.md");
      expect(entry).not.toBeNull();
      expect(entry.SourceId).toMatch(/^src_[0-9a-f]{16}$/);
    });

    it("round-trips a v2.0 manifest with SourceId intact", async () => {
      const col = "RoundTrip";
      parser = new DocumentParser(tempDir, col);
      parser.addOrUpdate("src_roundtrip1234567", "file.md", "/file.md", "H", 1, 1, "m");
      await parser.save();

      const p2 = new DocumentParser(tempDir, col);
      await p2.load();
      const entry = p2.getEntry("src_roundtrip1234567");
      expect(entry).not.toBeNull();
      expect(entry.SourceId).toBe("src_roundtrip1234567");
    });

    it("warns and loads empty entries when Version is unrecognised", async () => {
      const col = "MigFuture";
      await writeManifest(tempDir, col, {
        Version: "99.0",
        Collection: col,
        Entries: [v1Entry],
      });

      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const p = new DocumentParser(tempDir, col);
      await p.load();

      expect(p.count()).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("99.0"));
      warnSpy.mockRestore();
    });
  });
});
