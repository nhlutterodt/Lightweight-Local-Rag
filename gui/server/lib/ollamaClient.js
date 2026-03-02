// Mutex for sequential embedding requests
let embedPromise = Promise.resolve();

export async function embed(text, model, baseUrl) {
  const execute = async () => {
    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });

    if (!response.ok) {
      const textBody = await response.text().catch(() => "");
      throw new Error(`Ollama embed failed: ${response.status} ${textBody}`);
    }

    const data = await response.json();
    return new Float32Array(data.embedding);
  };

  embedPromise = embedPromise.then(execute).catch(() => execute());
  return embedPromise;
}

export async function chatStream(
  messages,
  model,
  baseUrl,
  onChunk,
  abortSignal = null,
) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Ollama chat failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    // Process newlines
    let nlIndex;
    while ((nlIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.substring(0, nlIndex).trim();
      buffer = buffer.substring(nlIndex + 1);

      if (line) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.message && parsed.message.content) {
            onChunk(parsed.message.content);
          }
          if (parsed.done === true) {
            return;
          }
        } catch (e) {
          console.warn(
            "[OllamaClient] JSON parse error on stream chunk:",
            e.message,
          );
        }
      }
    }
  }
}
