import { jest } from "@jest/globals";
import fs from "fs";
import path from "path";
import os from "os";
import { XmlLogger } from "../lib/xmlLogger.js";

describe("XmlLogger", () => {
  const TEST_DIR = path.join(os.tmpdir(), "xml-logger-test");
  const origCwd = process.cwd();

  beforeAll(() => {
    // Mock process.cwd to control where the logger thinks it is
    process.cwd = jest.fn(() => path.join(TEST_DIR, "gui", "server"));
    fs.mkdirSync(path.join(TEST_DIR, "PowerShell Scripts", "Data"), {
      recursive: true,
    });
  });

  afterAll(() => {
    process.cwd = origCwd;
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("should initialize a new XML file with root element if missing", async () => {
    const logger = new XmlLogger("test-log-1");
    await logger.initPromise;

    const fileContent = fs.readFileSync(logger.logFile, "utf-8");
    expect(fileContent).toContain("<PowerShellLog>");
    expect(fileContent).toContain("</PowerShellLog>");
  });

  it("should append a new LogEntry correctly", async () => {
    const logger = new XmlLogger("test-log-2");

    const success = await logger.append("INFO", "TEST", "Hello World & > <");
    expect(success).toBe(true);

    const fileContent = fs.readFileSync(logger.logFile, "utf-8");
    expect(fileContent).toContain("<LogEntry>");
    expect(fileContent).toContain("<Timestamp>");
    expect(fileContent).toContain("<Level>INFO</Level>");
    expect(fileContent).toContain("<Category>TEST</Category>");
    // Check escaping
    expect(fileContent).toContain("Hello World &amp; &gt; &lt;");

    // Ensure the document matches valid XML structure with root closing tag at the end
    expect(fileContent.trim().endsWith("</PowerShellLog>")).toBe(true);
  });
});
