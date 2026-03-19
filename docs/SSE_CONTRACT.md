---
doc_state: reference-contract
doc_owner: api
canonical_ref: docs/SSE_CONTRACT.md
last_reviewed: 2026-03-17
audience: engineering
---
# SSE Contract — `/api/chat`

> **Authority:** This document defines the exact SSE event shapes that the server (`server.js`) must produce and the client (`main.js`) must consume. Both sides must conform to this contract. Any change requires updating **both** implementations **and** their tests.

## Wire Format

The `/api/chat` endpoint uses [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) over a standard HTTP response. Each event is a single line:

```text
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
      "chunkId": "chk_abcd1234",
      "sourceId": "src_1234abcd",
      "fileName": "doc.pdf",
      "headerContext": "doc.pdf > Page 3",
      "locatorType": "page-range",
      "pageStart": 3,
      "pageEnd": 3,
      "score": 0.85,
      "preview": "First 100 chars of the chunk..."
    }
  ]
}
```

| Field                       | Type         | Description                                                              |
| --------------------------- | ------------ | ------------------------------------------------------------------------ |
| `type`                      | `"metadata"` | Discriminator                                                            |
| `citations`                 | `array`      | Retrieved document chunks                                                |
| `citations[].chunkId`       | `string`     | Stable chunk identity                                                    |
| `citations[].sourceId`      | `string`     | Stable source identity                                                   |
| `citations[].fileName`      | `string`     | **Must be `fileName`, not `file`**                                       |
| `citations[].headerContext` | `string`     | Breadcrumb path from SmartTextChunker                                    |
| `citations[].locatorType`   | `string`     | Locator class; `page-range` is used for page-aware PDF citations              |
| `citations[].pageStart`     | `integer`    | Optional start page for `page-range` citations only                      |
| `citations[].pageEnd`       | `integer`    | Optional end page for `page-range` citations only                        |
| `citations[].score`         | `number`     | Normalized relevance score (0–1], higher is better                       |
| `citations[].preview`       | `string`     | First ~100 chars of chunk text                                           |

`pageStart` and `pageEnd` are additive fields. The server emits them only when the citation comes from persisted page-aware provenance and `locatorType` is `page-range`.

### 3. Token Event (repeated)

```json
{ "message": { "content": "Hello" } }
```

| Field             | Type     | Description               |
| ----------------- | -------- | ------------------------- |
| `message.content` | `string` | A text token from the LLM |

> **Note:** Reasoning models may also include `message.thinking` for chain-of-thought tokens. The client handles both.

### 4. Answer References Event (final grounding signal)

```json
{
  "type": "answer_references",
  "references": [
    {
      "chunkId": "chk_abcd1234",
      "sourceId": "src_1234abcd",
      "fileName": "doc.md"
    }
  ]
}
```

| Field                   | Type                  | Description                               |
| ----------------------- | --------------------- | ----------------------------------------- |
| `type`                  | `"answer_references"` | Final machine-readable grounding payload  |
| `references`            | `array`               | Referenced approved chunks                |
| `references[].chunkId`  | `string`              | Referenced chunk id                       |
| `references[].sourceId` | `string`              | Referenced source id                      |
| `references[].fileName` | `string`              | Display file name                         |

### 5. Grounding Warning Event (conditional)

```json
{
  "type": "grounding_warning",
  "code": "NO_APPROVED_CONTEXT",
  "message": "No approved context was available. The answer is not grounded in retrieved documents."
}
```

| Field     | Type                  | Description                        |
| --------- | --------------------- | ---------------------------------- |
| `type`    | `"grounding_warning"` | Grounding warning discriminator    |
| `code`    | `string`              | Warning code                       |
| `message` | `string`              | Human-readable warning             |

### 6. Error Event (exceptional)

```json
{ "error": "message", "details": "..." }
```

---

## Headers

| Header          | Example                                          | Description                        |
| --------------- | ------------------------------------------------ | ---------------------------------- |
| `Server-Timing` | `embed;dur=18.2, search;dur=0.4, total;dur=18.9` | W3C timing for the retrieval phase |

---

## Event Ordering Guarantees

1. `status` is emitted first.
2. `metadata` is emitted before token events.
3. Token events (`message.content`) stream next.
4. `answer_references` is emitted after all token events.
5. `grounding_warning` may be emitted after `answer_references` when no approved context exists.

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

