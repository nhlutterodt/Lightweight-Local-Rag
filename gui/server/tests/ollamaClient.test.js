import { jest } from "@jest/globals";
import { embed, chatStream } from "../lib/ollamaClient.js";

describe("ollamaClient", () => {
  const model = "test-model";
  const baseUrl = "http://localhost:11434";

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [1, 2, 3] }),
    });
  });

  afterEach(async () => {
    // Flush the queue so it doesn't bleed into the next test
    try {
      await embed("flush", model, baseUrl);
    } catch (e) {}
    jest.restoreAllMocks();
  });

  describe("embed", () => {
    it("should fetch embeddings and return Float32Array on success", async () => {
      const mockEmbedding = [1, 2, 3];
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: mockEmbedding }),
      });

      const result = await embed("test text", model, baseUrl);

      expect(global.fetch).toHaveBeenCalledWith(`${baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: "test text" }),
      });
      expect(result).toBeInstanceOf(Float32Array);
      expect(Array.from(result)).toEqual(mockEmbedding);
    });

    it("should throw an error if the response is not ok", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await expect(embed("fail text", model, baseUrl)).rejects.toThrow(
        "Ollama embed failed: 500 Internal Server Error",
      );
    });

    it("should correctly queue sequential requests", async () => {
      const callOrder = [];

      global.fetch.mockImplementation(async (url, options) => {
        const body = JSON.parse(options.body);
        callOrder.push(body.prompt);
        return {
          ok: true,
          json: async () => ({ embedding: [1, 2, 3] }),
        };
      });

      const p1 = embed("first", model, baseUrl);
      const p2 = embed("second", model, baseUrl);

      await Promise.all([p1, p2]);

      expect(callOrder).toEqual(["first", "second"]);
    });

    it("should recover the queue if a previous request fails", async () => {
      const callOrder = [];

      global.fetch
        .mockImplementationOnce(async () => {
          callOrder.push("failed_req");
          return { ok: false, status: 500, text: async () => "Error" };
        })
        .mockImplementationOnce(async (url, options) => {
          callOrder.push("success_req");
          return { ok: true, json: async () => ({ embedding: [1] }) };
        });

      await expect(embed("fail", model, baseUrl)).rejects.toThrow();
      const res = await embed("success", model, baseUrl);

      expect(callOrder).toEqual(["failed_req", "success_req"]);
      expect(Array.from(res)).toEqual([1]);
    });
  });

  describe("chatStream", () => {
    const encoder = new TextEncoder();

    function createMockStream(chunks) {
      let i = 0;
      return {
        getReader: () => ({
          read: async () => {
            if (i < chunks.length) {
              return { done: false, value: encoder.encode(chunks[i++]) };
            }
            return { done: true };
          },
        }),
      };
    }

    it("should emit chunks of parsed content", async () => {
      const onChunk = jest.fn();

      const chunk1 = JSON.stringify({ message: { content: "Hello " } }) + "\n";
      const chunk2 = JSON.stringify({ message: { content: "World!" } }) + "\n";
      const chunk3 = JSON.stringify({ done: true }) + "\n";

      global.fetch.mockResolvedValueOnce({
        ok: true,
        body: createMockStream([chunk1, chunk2, chunk3]),
      });

      const messages = [{ role: "user", content: "Hi" }];
      await chatStream(messages, model, baseUrl, onChunk);

      expect(global.fetch).toHaveBeenCalledWith(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: true }),
        signal: null,
      });

      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(onChunk).toHaveBeenNthCalledWith(1, "Hello ");
      expect(onChunk).toHaveBeenNthCalledWith(2, "World!");
    });

    it("should throw an error when response is not ok", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(chatStream([], model, baseUrl, () => {})).rejects.toThrow(
        "Ollama chat failed: 404",
      );
    });

    it("should handle mid-stream parse errors gracefully and continue", async () => {
      const onChunk = jest.fn();
      const consoleWarnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const chunk1 = JSON.stringify({ message: { content: "Good " } }) + "\n";
      const invalidChunk = "{ invalid json \n";
      const chunk2 =
        JSON.stringify({ message: { content: "Boy" }, done: true }) + "\n";

      global.fetch.mockResolvedValueOnce({
        ok: true,
        body: createMockStream([chunk1, invalidChunk, chunk2]),
      });

      await chatStream([], model, baseUrl, onChunk);

      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
});
