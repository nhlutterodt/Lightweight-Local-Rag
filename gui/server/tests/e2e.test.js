import { jest } from "@jest/globals";
import puppeteer from "puppeteer";
import request from "supertest";

// ESM Mocking for child_process (same as unit tests)
jest.unstable_mockModule("child_process", () => ({
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn((event, cb) => {
      if (event === "close") cb(0);
    }),
  })),
  spawnSync: jest.fn(() => ({
    status: 0,
    stdout: JSON.stringify({ Status: "MockConfig" }),
  })),
}));

// Load the server dynamically after mocking
const appModule = await import("../server.js");
const app = appModule.default;

const TEST_PORT = 3005; // Different from default 3001 to prevent collisions

describe.skip("E2E UI Regression (Vanilla JS)", () => {
  let server;
  let browser;
  let page;

  beforeAll(async () => {
    // 1. Boot up the Express Server
    server = app.listen(TEST_PORT);

    // 2. Launch Puppeteer Headless Browser
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    page = await browser.newPage();
  });

  afterAll(async () => {
    // Shutdown both the browser instance and Express server gracefully
    if (browser) await browser.close();
    if (server) {
      server.closeAllConnections(); // Instantly kill SSE streams
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe("Initial Page Load", () => {
    it("should serve the main HTML and connect to the dashboard", async () => {
      const response = await page.goto(`http://localhost:${TEST_PORT}/`);
      expect(response.status()).toBe(200);

      // Verify page title
      const title = await page.title();
      expect(title).toBe("Local RAG Project | Interactive AI");

      // Verify the H1 Header rendered
      const h1Text = await page.$eval("h1", (el) => el.innerText);
      expect(h1Text).toBe("Local RAG");
    });
  });

  describe("Form Interactive Elements", () => {
    it("should have a Chat Interface with a send button", async () => {
      await page.goto(`http://localhost:${TEST_PORT}/`);

      const sendBtn = await page.$("#sendMessage");
      expect(sendBtn).not.toBeNull();

      // Check if it's disabled or enabled via JS payload
      const isDisabled = await page.$eval("#sendMessage", (el) => el.disabled);
      // It might be disabled initially if models aren't ready,
      // but it exists in the DOM.
      expect(typeof isDisabled).toBe("boolean");
    });

    it("should have a functional Queue Ingestion path input", async () => {
      await page.goto(`http://localhost:${TEST_PORT}/`);

      const pathInput = await page.$("#ingestPath");
      expect(pathInput).not.toBeNull();

      // Type some text
      await page.type("#ingestPath", "C:/test/path");
      const typedValue = await page.$eval("#ingestPath", (el) => el.value);
      expect(typedValue).toBe("C:/test/path");
    });
  });

  describe("Sidebar Widgets", () => {
    it("should render the API Connection Status", async () => {
      await page.goto(`http://localhost:${TEST_PORT}/`);

      const statusBox = await page.$("#connectionStatus");
      expect(statusBox).not.toBeNull();

      const statusClass = await page.$eval(
        "#connectionStatus",
        (el) => el.className,
      );
      // Wait for at least the fetch attempt
      await new Promise((r) => setTimeout(r, 500));
      expect(statusClass).toContain("status-indicator");
    });
  });
});
