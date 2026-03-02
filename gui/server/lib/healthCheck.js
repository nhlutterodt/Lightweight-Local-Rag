import fs from "fs";
import path from "path";
import axios from "axios";

/**
 * Perform a comprehensive health check mirroring Invoke-SystemHealth.ps1
 * @param {Object} config - The project configuration.
 */
export async function getSystemHealth(config) {
  const results = {
    timestamp: new Date().toISOString(),
    status: "healthy",
    checks: [],
  };

  // 1. Ollama Check
  try {
    const ollamaUrl =
      process.env.OLLAMA_URL ||
      config?.AI_Models?.Ollama_Endpoint ||
      "http://localhost:11434";
    await axios.get(ollamaUrl.replace(/\/$/, "") + "/api/tags", {
      timeout: 2000,
    });
    results.checks.push({
      name: "Ollama Service",
      status: "OK",
      message: "Service reachable",
    });
  } catch (err) {
    results.checks.push({
      name: "Ollama Service",
      status: "ERROR",
      message: err.message || "Service unreachable",
    });
  }

  // 2. Vector Store Check
  try {
    const dataDir = config?.Paths?.DataDir
      ? config.Paths.DataDir
      : path.join(process.cwd(), "..", "..", "PowerShell Scripts", "Data");

    // We check if the LanceDB path exists or just the Data dir
    const isDataDir = fs.existsSync(dataDir);
    results.checks.push({
      name: "Vector Store",
      status: isDataDir ? "OK" : "WARNING",
      message: isDataDir
        ? `Data directory exists at ${dataDir}`
        : "Data directory missing; initialization required",
    });
  } catch (err) {
    results.checks.push({
      name: "Vector Store",
      status: "ERROR",
      message: err.message,
    });
  }

  // 3. Storage Check (simplified)
  try {
    if (fs.promises.statfs) {
      const stats = await fs.promises.statfs(process.cwd());
      const freeGB =
        Math.round(((stats.bfree * stats.bsize) / (1024 * 1024 * 1024)) * 100) /
        100;
      results.checks.push({
        name: "Local Disk",
        status: freeGB > 2 ? "OK" : "WARNING",
        message: `${freeGB} GB free on drive`,
      });
    } else {
      results.checks.push({
        name: "Local Disk",
        status: "OK",
        message: "Storage check skipped (Node versions < 19.6)",
      });
    }
  } catch (err) {
    // Ignore storage check errors entirely, just like PS
  }

  // Determine overall status
  if (results.checks.some((c) => c.status === "ERROR")) {
    results.status = "error";
  } else if (results.checks.some((c) => c.status === "WARNING")) {
    results.status = "warning";
  }

  return results;
}
