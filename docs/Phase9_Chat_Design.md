# Phase 9: Interactive RAG Chat - Design & Strategy

## Executive Summary

Phase 9 builds upon the RAG foundation (Phase 8) to create an interactive "Chat with your Data" experience. Instead of single-shot queries, the system will support conversational context, allowing users to ask follow-up questions and receive answers grounded in the project's documentation and code.

## 1. Deliverables

### 1.1 Core Components (PowerShell Modules/Classes)

- **`ChatSession`**: A class to manage the state of a conversation.
  - _Properties_: `History` (List of messages), `ContextWindow` (Token limit estimate).
  - _Methods_:
    - `AddUserMessage($text)`
    - `AddSystemMessage($text)`
    - `AddModelResponse($text)`
- **`PromptTemplate`**: **[NEW]** A class to strictly manage prompt structure.
  - _Properties_: `RawTemplate` (string with placeholders like `{Context}`).
  - _Methods_: `Render($variables)` (Returns final string, enforces required keys).
  - _Goal_: Decouple logic from phrasing. Easy to swap "Personas".
- **`OllamaClient` Update**:
  - Add `GenerateChatCompletion` support (wrapping `/api/chat`) for better model compatibility (e.g. Llama3/Mistral behave better with chat APIs than raw generate).

### 1.2 Scripts / Tools

- **`Chat-Rag.ps1`**:
  - Interactive Console Loop (`while($true)`).
  - Uses `PromptTemplate` to format the system message dynamically.
  - **Logic**:
    1.  Accept User Input.
    2.  **Retrieve**: Search `VectorStore` for top 3 relevant chunks.
    3.  **Augment**: Construct a system prompt containing these chunks.
    4.  **Generate**: Call Ollama with the augmented history.
    5.  **Print**: Stream (or print) the response.

## 2. Technical Approach

### 2.1 The "Strict Template" Pattern

We will define reusable templates in a configuration way.

**Template: Standard RAG**

```text
SYSTEM: You are a technical assistant.
STRICT RULES:
1. Use ONLY the provided context.
2. If the answer is missing, say "Data Not Found".
3. Cite the [Source: Filename] for every claim.

CONTEXT:
{Context}

USER: {Question}
```

**Control Mechanism**:

- The `PromptTemplate` class will **throw an error** if a required placeholder (e.g., `{Context}`) is missing during rendering.
- Templates will be stored as static members or a config hash, making them easy to edit in one place.

### 2.2 History Management

- **Sliding Window**: We cannot feed infinite history.
- **Strategy**: Keep last 10 messages. The "Context" chunks are strictly related to the _current_ query (or last 2 queries rephrased), not the entire history.

## 3. Identified Patterns for Success

### ✅ Pattern: "Query Rephrasing"

Users often ask "What about that?" as a follow-up. Searching for "What about that?" yields nothing.
**Solution**: (Advanced) Use the LLM to rephrase the latest question based on history _before_ searching vector store.
_For P9 MVP_: We will just search the raw query first. If results are poor, we rely on chat history.

### ✅ Pattern: System Instructions

Explicitly telling the model _how_ to cite sources (e.g. "Reference the filename when possible") improves utility.

## 4. Identified Anti-Patterns (To Avoid)

### ⛔ Anti-Pattern: "The Recall Loop"

Feeding the _model's own previous RAG output_ back into the vector search query.
_Why_: Causes circular reinforcement of potentially hallucinated details.

### ⛔ Anti-Pattern: "Silent Failure"

If Ollama returns an error (e.g. timeout), the chat crashes.
_Fix_: The loop must catch errors `try/catch` and allow the user to retry without losing session state.

## 5. Implementation Roadmap (Draft)

1.  **Step 9.1**: Update `OllamaClient` to support `/api/chat` (Chat Objects).
2.  **Step 9.2**: Create `ChatSession` class (State Management).
3.  **Step 9.3**: Build `Chat-Rag.ps1` (Interactive Loop).
