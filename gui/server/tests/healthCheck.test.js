import { jest } from "@jest/globals";
import path from "path";
import fs from "fs";
import os from "os";

// We mock axios to simulate Ollama behavior
jest.unstable_mockModule("axios", () => ({
  default: {
    get: jest.fn(),
  },
}));

const axiosModule = await import("axios");
const axios = axiosModule.default;

const { getSystemHealth } = await import("../lib/healthCheck.js");

describe("getSystemHealth", () => {
  const TEST_CONFIG = {
    Paths: { DataDir: path.join(os.tmpdir(), "health-test-data") },
  };

  beforeAll(() => {
    if (!fs.existsSync(TEST_CONFIG.Paths.DataDir)) {
      fs.mkdirSync(TEST_CONFIG.Paths.DataDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(TEST_CONFIG.Paths.DataDir)) {
      fs.rmSync(TEST_CONFIG.Paths.DataDir, { recursive: true });
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should return healthy status when Ollama and DB are reachable", async () => {
    axios.get.mockResolvedValueOnce({ data: { models: [] } }); // Mock Ollama success

    const health = await getSystemHealth(TEST_CONFIG);

    expect(health.status).toBe("healthy");
    expect(
      health.checks.some(
        (c) => c.name === "Ollama Service" && c.status === "OK",
      ),
    ).toBe(true);
    expect(
      health.checks.some((c) => c.name === "Vector Store" && c.status === "OK"),
    ).toBe(true);
  });

  it("should return error status when Ollama is unreachable", async () => {
    axios.get.mockRejectedValueOnce(new Error("Connection refused")); // Mock Ollama failure

    const health = await getSystemHealth(TEST_CONFIG);

    expect(health.status).toBe("error");
    const ollamaCheck = health.checks.find((c) => c.name === "Ollama Service");
    expect(ollamaCheck.status).toBe("ERROR");
    expect(ollamaCheck.message).toBe("Connection refused");
  });

  it("should return warning status when DB directory is missing", async () => {
    axios.get.mockResolvedValueOnce({ data: { models: [] } }); // Mock Ollama success

    const missingDbConfig = {
      Paths: { DataDir: path.join(os.tmpdir(), "db-does-not-exist") },
    };
    const health = await getSystemHealth(missingDbConfig);

    // If there's no error in another check, but just a missing DB, the overall status is warning
    expect(health.status).toBe("warning");
    const dbCheck = health.checks.find((c) => c.name === "Vector Store");
    expect(dbCheck.status).toBe("WARNING");
    expect(dbCheck.message).toMatch(/missing/);
  });
});
