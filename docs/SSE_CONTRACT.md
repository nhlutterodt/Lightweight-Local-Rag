# SSE Contract — `/api/chat`

> **Authority:** This document defines the exact SSE event shapes that the server (`server.js`) must produce and the client (`main.js`) must consume. Both sides must conform to this contract. Any change requires updating **both** implementations **and** their tests.

## Wire Format

The `/api/chat` endpoint uses [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) over a standard HTTP response. Each event is a single line:

```
data: <JSON>\n\n
```

All `data:` payloads **must** be valid JSON. The client parses every line with `JSON.parse()`.

---

## Event Types

### 1. Status Event (first)

```json
{ "type": "status", "message": "" }
```

| Field     | Type       | Description                |
| --------- | ---------- | -------------------------- |
| `type`    | `"status"` | Discriminator              |
| `message` | `string`   | Status text (may be empty) |

### 2. Citations Event

```json
{
  "type": "metadata",
  "citations": [
    {
      "fileName": "doc.md",
      "headerContext": "Section > Subsection",
      "score": 0.85,
      "preview": "First 100 chars of the chunk..."
    }
  ]
}
```

| Field                       | Type         | Description                           |
| --------------------------- | ------------ | ------------------------------------- |
| `type`                      | `"metadata"` | Discriminator                         |
| `citations`                 | `array`      | Retrieved document chunks             |
| `citations[].fileName`      | `string`     | **Must be `fileName`, not `file`**    |
| `citations[].headerContext` | `string`     | Breadcrumb path from SmartTextChunker |
| `citations[].score`         | `number`     | Cosine similarity (0–1)               |
| `citations[].preview`       | `string`     | First ~100 chars of chunk text        |

### 3. Token Event (repeated)

```json
{ "message": { "content": "Hello" } }
```

| Field             | Type     | Description               |
| ----------------- | -------- | ------------------------- |
| `message.content` | `string` | A text token from the LLM |

> **Note:** Reasoning models may also include `message.thinking` for chain-of-thought tokens. The client handles both.

### 4. Error Event (exceptional)

```json
{ "error": "message", "details": "..." }
```

---

## Headers

| Header          | Example                                          | Description                        |
| --------------- | ------------------------------------------------ | ---------------------------------- |
| `Server-Timing` | `embed;dur=18.2, search;dur=0.4, total;dur=18.9` | W3C timing for the retrieval phase |

---

## Test Coverage

| Contract Point                            | Test File              |
| ----------------------------------------- | ---------------------- |
| All `data:` lines are valid JSON          | `sse.contract.test.js` |
| Status event shape                        | `sse.contract.test.js` |
| Citations have `fileName` not `file`      | `sse.contract.test.js` |
| Token events have `message.content`       | `sse.contract.test.js` |
| Server-Timing header present              | `sse.contract.test.js` |
| `findNearest` returns correct field names | `vectorStore.test.js`  |
