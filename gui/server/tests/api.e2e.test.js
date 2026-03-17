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

function parseSSEEvents(rawText) {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
}

async function runChatStream(body) {
  const response = await request(app).post("/api/chat").send(body);
  return parseSSEEvents(response.text);
}

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
    const events = await runChatStream({
      messages: [
        {
          role: "user",
          content: "What does the dummy document say about X?",
        },
      ],
      collection: collectionName,
    });

    const metadataIndex = events.findIndex((event) => event.type === "metadata");
    const answerReferencesIndex = events.findIndex(
      (event) => event.type === "answer_references",
    );
    const lastTokenIndex = events.reduce(
      (lastIndex, event, index) =>
        event.message?.content ? index : lastIndex,
      -1,
    );
    const metadataEvent = events[metadataIndex];
    const answerReferencesEvent = events[answerReferencesIndex];

    expect(metadataEvent).toBeDefined();
    expect(metadataEvent.citations).toBeDefined();
    expect(metadataEvent.citations.length).toBeGreaterThan(0);
    expect(metadataEvent.citations.every((citation) => typeof citation.fileName === "string")).toBe(true);
    expect(metadataEvent.citations.every((citation) => citation.fileName.length > 0)).toBe(true);
    expect(metadataEvent.citations.every((citation) => citation.chunkId)).toBe(true);
    expect(metadataEvent.citations.every((citation) => citation.sourceId)).toBe(true);

    const tokenEvents = events.filter((event) => event.message?.content);
    expect(tokenEvents.length).toBeGreaterThan(0);
    expect(tokenEvents[0].message.content).toContain("dummy document");

    expect(answerReferencesEvent).toBeDefined();
    expect(Array.isArray(answerReferencesEvent.references)).toBe(true);
    expect(answerReferencesEvent.references.length).toBeGreaterThan(0);
    expect(answerReferencesIndex).toBeGreaterThan(lastTokenIndex);

    const citationChunkIds = new Set(
      metadataEvent.citations.map((citation) => citation.chunkId),
    );
    for (const reference of answerReferencesEvent.references) {
      expect(citationChunkIds.has(reference.chunkId)).toBe(true);
    }
  });

  it("Step E: Should emit grounding_warning when no approved evidence exists", async () => {
    const events = await runChatStream({
      messages: [
        {
          role: "user",
          content: "What does the missing collection say?",
        },
      ],
      collection: "collection_that_does_not_exist",
    });

    const answerReferencesEvent = events.find(
      (event) => event.type === "answer_references",
    );
    const groundingWarningEvent = events.find(
      (event) => event.type === "grounding_warning",
    );

    expect(answerReferencesEvent).toBeDefined();
    expect(Array.isArray(answerReferencesEvent.references)).toBe(true);
    expect(groundingWarningEvent).toBeDefined();
    expect(groundingWarningEvent.code).toBe("NO_APPROVED_CONTEXT");
    expect(typeof groundingWarningEvent.message).toBe("string");
    expect(groundingWarningEvent.message.length).toBeGreaterThan(0);
  });
});
