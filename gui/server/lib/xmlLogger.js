import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";

export class XmlLogger {
  constructor(logName = "bridge-log") {
    const dataDir = path.join(
      process.cwd(),
      "..",
      "..",
      "PowerShell Scripts",
      "Data",
    );
    this.logFile = path.join(dataDir, `${logName}.xml`);
    this.initPromise = this._init();
  }

  async _init() {
    try {
      await fsPromises.mkdir(path.dirname(this.logFile), { recursive: true });
      if (!fs.existsSync(this.logFile)) {
        // Create new file with root element
        await fsPromises.writeFile(
          this.logFile,
          "<PowerShellLog>\n</PowerShellLog>",
        );
      }
    } catch (err) {
      console.error("[XmlLogger] Initialization failed:", err);
    }
  }

  async append(level, category, message) {
    await this.initPromise;
    try {
      const timestamp = new Date().toISOString();
      const escapedMessage = String(message)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

      const entry = `  <LogEntry>\n    <Timestamp>${timestamp}</Timestamp>\n    <Level>${level}</Level>\n    <Category>${category}</Category>\n    <Message>${escapedMessage}</Message>\n  </LogEntry>\n`;

      // Read current content
      let content = await fsPromises.readFile(this.logFile, "utf-8");

      // Remove closing tag, append new entry, add closing tag
      content = content.replace("</PowerShellLog>", entry + "</PowerShellLog>");

      await fsPromises.writeFile(this.logFile, content, "utf-8");
      return true;
    } catch (err) {
      console.error("[XmlLogger] Append failed:", err);
      return false;
    }
  }
}

export const bridgeLogger = new XmlLogger("bridge-log");
