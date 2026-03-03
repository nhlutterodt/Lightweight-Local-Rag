import { jest } from "@jest/globals";
import request from "supertest";
import path from "path";
import fs from "fs";
import os from "os";

// 1. Setup the Test Environment
const TEST_DIR = path.join(os.tmpdir(), "rag-api-e2e-" + Date.now());
// Ensure the test directory is considered a "safe" path by the server's security checks
process.env.ALLOWED_BROWSE_ROOTS = TEST_DIR;
process.env.EMBEDDING_MODEL = "test-embed-model"; // Match the hardcoded mock lancedb results

// Mock Ollama to make the test fast and deterministic (no real LLM required)
jest.unstable_mockModule("../lib/ollamaClient.js", () => ({
  embed: jest.fn().mockResolvedValue(new Float32Array([0.1, 0.2, 0.3, 0.4])),
  chatStream: jest.fn(async (messages, model, baseUrl, onChunk, signal) => {
    // Send a mock chunk back
    onChunk("According to the dummy document, X is the answer.");
  }),
}));

const appModule = await import("../server.js");
const app = appModule.default;

describe("Backend API Integration Flow (No Browser)", () => {
  const collectionName = "e2e_test_" + Date.now();

  beforeAll(() => {
    // Create the dummy directory and a dummy file
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(TEST_DIR, "dummy.txt"),
      "This is a dummy document. X is the answer.",
      "utf8",
    );
  });

  afterAll(() => {
    // Teardown the dummy directory
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("Step A: Should submit an ingestion job to the queue", async () => {
    const res = await request(app).post("/api/queue").send({
      path: TEST_DIR,
      collection: collectionName,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(["pending", "processing", "completed"]).toContain(res.body.status);
  });

  it("Step B: Should wait for the pipeline to complete the job", async () => {
    // Poll the /api/queue endpoint until the job completes
    let isComplete = false;
    let attempts = 0;
    const maxAttempts = 20;

    while (!isComplete && attempts < maxAttempts) {
      const res = await request(app).get("/api/queue");
      const jobs = res.body;

      const testJob = jobs.find(
        (j) => j.collection === collectionName && j.path === TEST_DIR,
      );

      if (testJob && testJob.status === "completed") {
        isComplete = true;
      } else if (testJob && testJob.status === "failed") {
        throw new Error("Ingestion job failed: " + testJob.progress);
      } else {
        // Wait 500ms before polling again
        await new Promise((resolve) => setTimeout(resolve, 500));
        attempts++;
      }
    }

    expect(isComplete).toBe(true);
  }, 15000); // 15 second timeout for this test

  it("Step C: Should verify vector health via metrics", async () => {
    const res = await request(app).get("/api/index/metrics");
    expect(res.statusCode).toBe(200);

    const metrics = res.body;
    console.log("Vector Metrics returned:", JSON.stringify(metrics, null, 2));

    const testCollectionMetric = metrics.find((m) => m.name === collectionName);

    expect(testCollectionMetric).toBeDefined();
    expect(testCollectionMetric.vectorCount).toBeGreaterThan(0);
    expect(testCollectionMetric.health).toBe("OK");
  });

  it("Step D: Should fetch citations and a streamed answer via SSE chat", async () => {
    return new Promise((resolve, reject) => {
      // Because this is an SSE endpoint, we consume it differently than normal JSON
      const req = request(app)
        .post("/api/chat")
        .send({
          messages: [
            {
              role: "user",
              content: "What does the dummy document say about X?",
            },
          ],
          collection: collectionName,
        })
        .buffer(false) // Handle stream
        .parse((res, cb) => {
          let data = "";
          res.on("data", (chunk) => {
            const lines = chunk.toString().split("\n\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const jsonStr = line.substring(6);
                if (!jsonStr) continue;

                try {
                  const payload = JSON.parse(jsonStr);

                  // 1. Assert Metadata/Citations match our dummy file
                  if (payload.type === "metadata") {
                    expect(payload.citations).toBeDefined();
                    expect(payload.citations.length).toBeGreaterThan(0);
                    expect(payload.citations[0].fileName).toBe("dummy.txt");
                  }

                  // 2. Assert Message content gets streamed correctly
                  if (payload.message && payload.message.content) {
                    expect(payload.message.content).toContain("dummy document");
                    resolve(); // Complete the test once we get the message chunk
                  }
                } catch (e) {
                  // Ignore parse errors on incomplete chunks if any
                }
              }
            }
          });

          res.on("end", () => {
            cb(null, data);
          });

          res.on("error", (err) => {
            reject(err);
          });
        });

      // Trigger the request
      req.end((err) => {
        if (err) reject(err);
      });
    });
  });
});
