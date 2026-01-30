import { spawn } from "child_process";
import path from "path";

/**
 * PowerShellRunner Class
 * Encapsulates the execution of PowerShell scripts from Node.js with standardized
 * argument handling, error reporting, and process management.
 */
class PowerShellRunner {
  constructor(scriptsDir) {
    this.scriptsDir = scriptsDir;
  }

  /**
   * Spawns a PowerShell process for a specific script.
   * @param {string} scriptName - The filename of the script in the scripts directory.
   * @param {string[]} args - Array of arguments to pass to the script.
   * @param {Object} options - Additional spawn options.
   * @returns {ChildProcess} The spawned process object.
   */
  spawn(scriptName, args = [], options = {}) {
    const { timeout, ...spawnOptions } = options;
    const scriptPath = path.join(this.scriptsDir, scriptName);
    const spawnArgs = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      ...args,
    ];

    console.log(
      `[PS Runner] Spawning: ${scriptName} (Total Args: ${args.length})`,
    );

    const ps = spawn("pwsh", spawnArgs, {
      ...spawnOptions,
      shell: false, // Security: prevent shell injection
    });

    if (timeout) {
      setTimeout(() => {
        if (!ps.killed) {
          console.warn(
            `[PS Runner] Script ${scriptName} timed out after ${timeout}ms. Killing process.`,
          );
          ps.kill("SIGTERM");
        }
      }, timeout);
    }

    // Default error listener for spawn failures (e.g., pwsh not found)
    ps.on("error", (err) => {
      console.error(
        `[PS Runner Error] Failed to start ${scriptName}:`,
        err.message,
      );
    });

    return ps;
  }

  /**
   * utility to parse structured JSON objects from a script's stdout stream.
   * Expects JSON objects to be printed as single lines.
   * @param {ChildProcess} ps - The process to monitor.
   * @param {Function} onJson - Callback for parsed JSON objects.
   * @param {Function} onRaw - Callback for non-JSON or malformed lines.
   */
  static parseJsonStream(ps, onJson, onRaw) {
    let buffer = "";

    ps.stdout.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop(); // Keep potentially incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            const obj = JSON.parse(trimmed);
            onJson(obj);
          } catch (e) {
            onRaw(trimmed);
          }
        } else {
          onRaw(trimmed);
        }
      }
    });

    // Handle any remaining data in the buffer on close
    ps.on("close", () => {
      const trimmed = buffer.trim();
      if (trimmed) {
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            onJson(JSON.parse(trimmed));
          } catch (e) {
            onRaw(trimmed);
          }
        } else {
          onRaw(trimmed);
        }
      }
    });
  }
}

export default PowerShellRunner;
