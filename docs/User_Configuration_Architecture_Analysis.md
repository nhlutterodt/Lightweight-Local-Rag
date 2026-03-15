---
doc_state: canonical
doc_owner: architecture
canonical_ref: docs/User_Configuration_Architecture_Analysis.md
last_reviewed: 2026-03-15
audience: engineering
---
# User Configuration Architecture Analysis

## Purpose

This document captures a grounded architectural analysis of where the application can expose more powerful configuration through both API and UI, while preserving correctness, safety, and a coherent mental model for users.

The immediate motivating example is model selection. The deeper goal is broader than model choice. The real objective is to place meaningful application configuration in the hands of the user without allowing the system to drift into inconsistent state, invalid retrieval behavior, or fragmented ownership across files, environment variables, UI-local state, and request payloads.

## Executive Summary

The repository already contains the beginnings of a configuration system, but it is not yet a first-class product surface.

Today, configuration exists across four different layers:

- `config/project-config.psd1` contains project defaults.
- `gui/server/lib/configLoader.js` loads that file and applies environment variable overrides.
- `gui/server/server.js` consumes those resolved values and also accepts a limited set of per-request overrides.
- `gui/client/react-client` stores some user choices in browser `localStorage` and some only in transient component state.

This means the system already supports configuration in practice, but not configuration as a deliberate capability.

The most important architectural insight is that not all settings are equally safe to expose.

- Some settings are runtime preferences and can be safely changed per user, per session, or per request.
- Some settings shape stored data and therefore must be treated as collection-level or system-level contracts.
- Some settings are operational and should likely remain install-time or admin-only.

The example of choosing a specific model that is installed locally is valid, but it contains two separate cases:

- Choosing a chat model is a good candidate for user-controlled runtime configuration.
- Choosing an embedding model is not merely a preference. It affects ingestion, vector dimensionality, retrieval validity, and compatibility with existing indexed collections.

If the project treats those two cases as identical, user-facing configuration will appear flexible while quietly producing broken or misleading behavior.

## What The Request Is Really Asking For

The request is not simply for more toggles in the UI.

It is asking for a foundational configuration architecture with the following properties:

1. A clear source of truth.
2. A clean API surface for reading and updating settings.
3. A UI that reflects actual backend state rather than local approximations.
4. A distinction between safe overrides and dangerous overrides.
5. A future-proof path for exposing more advanced configuration later.

In other words, the app should move from hidden implementation defaults to explicit configuration ownership.

## Current Reality In The Codebase

## Project Defaults Exist

The central project defaults already exist in `config/project-config.psd1`.

The `RAG` section currently defines:

- `OllamaUrl`
- `EmbeddingModel`
- `ChatModel`
- `ChunkSize`
- `ChunkOverlap`
- `TopK`
- `MinScore`
- `MaxContextTokens`
- `RetrievalMode`
- `FilteredVectorOverfetch`
- `HybridOverfetch`
- `HybridLexicalWeight`

This is already the nucleus of a durable configuration schema.

## The Backend Already Has A Config Loader

`gui/server/lib/configLoader.js` already provides a meaningful configuration mechanism:

- hardcoded defaults
- file-based overrides from `project-config.psd1`
- environment variable overrides for `OLLAMA_URL`, `EMBEDDING_MODEL`, and `CHAT_MODEL`

This means the system already has a precedence ladder, but only partially and informally.

## The Server Uses Config, But Only At Startup Scope

`gui/server/server.js` loads configuration once at startup and retains it in memory.

That config is then used to determine:

- Ollama base URL
- ingestion configuration
- index metrics metadata
- required models for readiness checks
- chat defaults
- retrieval defaults
- token budget defaults

This is useful, but it means the current system has no runtime settings contract beyond the few request fields that happen to be accepted by individual endpoints.

## The UI Already Exposes Some Choices, But Not As Settings

The React client already lets the user:

- choose a chat model from installed chat-capable models
- type a collection name
- choose an ingestion path
- persist some sidebar values in `localStorage`

However, this is not yet a real settings model.

The UI is currently mixing:

- application state
- browser-only preferences
- request parameters
- implicit defaults

without a shared schema from the server.

## Important Fragmentation Already Exists

There is already an example of why a formal configuration layer is needed.

The sidebar lets the user enter a collection name for ingestion, but chat requests in `App.jsx` are hardcoded to `"TestIngest"`.

That means the UI currently suggests the user is interacting with one collection while chat may actually query another collection entirely.

This is a configuration and state ownership problem, not merely a UI bug.

## Why The Model Example Is Architecturally Important

The model example is the right place to start because it exposes the hidden categories of configuration in the app.

## Chat Model Selection Is A Safe Runtime Preference

The chat path already accepts a request-level `model` in `POST /api/chat`.

This is good because chat generation is downstream of retrieval. As long as the target model is a valid chat-capable Ollama model, changing it does not invalidate the vector store.

This kind of setting can usually be:

- user-specific
- session-specific
- request-specific
- persisted as a preference

It is a strong candidate for early API and UI exposure.

## Embedding Model Selection Is A Data Contract

Embedding model choice is fundamentally different.

During ingestion, `IngestionQueue.js` uses the configured embedding model to create vectors and writes that model into each stored record as `EmbeddingModel`.

During retrieval, `VectorStore.load()` checks the embedding model in the collection and throws if it does not match the required model.

The legacy PowerShell flows in `Chat-Rag.ps1` and `Query-Rag.ps1` enforce the same rule.

This means embedding model is not just a runtime preference. It is one of the defining characteristics of an indexed collection.

Changing it casually creates several possible failure modes:

- retrieval errors due to model mismatch
- vector dimension mismatch
- silently incompatible ranking behavior
- collections that appear healthy but cannot be queried correctly
- confusing user experience where a selected model is installed but unusable with existing data

If exposed in the UI without a collection-aware compatibility model, this would feel empowering while actually being dangerous.

## Constraints And Realities

Any real user-configuration system in this project must respect the following realities.

## Constraint 1: The App Is Local-First And Machine-Specific

The app runs against local Ollama state, local filesystem content, and local vector indexes.

This means some configuration values depend on what is physically available on the current machine:

- installed models
- available folders
- existing collections
- vector store contents
- environment-specific allowed roots

As a result, configuration cannot be treated as a purely static file problem. Some settings must be validated against live machine state.

## Constraint 2: Settings Have Different Scopes

The current system already mixes settings from different scopes without naming them as such.

Those scopes are likely:

- install-level
- project-level
- collection-level
- user-level
- session-level
- request-level

If the project does not formalize these scopes, settings will continue to overlap and conflict.

## Constraint 3: Some Settings Are Safe To Override And Some Are Not

A useful rule is:

- output-generation settings are often safe to vary at runtime
- retrieval-tuning settings are often safe with validation
- ingestion-shaping settings are more dangerous
- storage and security settings are usually the least appropriate for casual runtime mutation

This distinction matters because the API should not expose every underlying config value with equal mutability.

## Constraint 4: The Repo Is Transitional

The repository contains both newer Node-based paths and older PowerShell-based flows.

That matters because a foundational configuration system must either:

- become the shared contract for both worlds

or

- clearly establish which runtime path is authoritative and which legacy paths are secondary

If this is not made explicit, the project risks implementing a clean config system for the web UI while leaving legacy tools out of sync.

## Constraint 5: Environment Variables Are Currently Treated As Top Priority

The backend currently applies environment variables as the highest-priority override in `configLoader.js`.

That is sensible for deployment and containerization, but it creates an important governance question:

If a user changes settings through the UI or API, what happens when an environment variable still overrides the same value?

Without a published precedence model, the user can make a change and see no effect, which feels like the app is broken.

## Missing Analysis That Needs To Be Made Explicit

Before implementation, the following missing analysis should be made explicit.

## Configuration Scope Model

The application should classify every candidate setting by scope.

### Install-Level

Examples:

- server port
- CORS origins
- allowed browse roots
- filesystem security policies

These are usually environment-owned or operator-owned, not normal end-user settings.

### Project-Level Defaults

Examples:

- default chat model
- default retrieval mode
- default `TopK`
- default `MinScore`
- default `MaxContextTokens`

These are good baseline behaviors for the app as a project.

### Collection-Level Contracts

Examples:

- embedding model
- chunk size
- chunk overlap
- collection schema version
- ingestion policy

These affect the shape and meaning of the index itself.

### User-Level Preferences

Examples:

- preferred chat model
- last-used collection
- preferred analytics density
- preferred default retrieval mode for that user

These should not mutate shared project behavior unless explicitly promoted.

### Session-Level Settings

Examples:

- current chat model for this tab
- current collection
- temporary retrieval constraints

These are useful for experimentation and should be easy to reset.

### Request-Level Overrides

Examples:

- use model X for this prompt
- use `hybrid` retrieval for this query
- reduce context window for one request

These should be explicit and auditable.

## Configuration Precedence Model

The project should define and document a strict precedence order.

A likely model is:

1. code defaults
2. project config file
3. persisted runtime settings
4. user preferences
5. session state
6. request overrides
7. environment variables for protected operational values

Another possible model is to keep environment variables above everything else.

Either can work, but one must be chosen deliberately and explained clearly in both code and documentation.

## Mutability Model

Each setting should be classified as one of:

- read-only
- writable immediately
- writable with validation
- writable but requires restart
- writable but requires reindex
- writable only by operator or admin

Without this classification, the UI cannot honestly explain what a settings change will do.

## Compatibility Model

The system needs a definition of compatibility between:

- a selected chat model and the chat endpoint
- a selected embedding model and an existing collection
- a selected retrieval mode and available metadata
- a selected collection and current index schema

The app should not present a value as selectable unless it can also explain whether that value is usable in the current context.

## Misconceptions To Correct Before Design Solidifies

Several intuitive ideas sound correct but are incomplete.

## Misconception 1: "If It Is Installed, It Should Be Selectable"

This is only partially true.

Installed chat models are usually selectable for chat generation.

Installed embedding models are not automatically safe to use against existing collections. They may require new ingestion or separate collection ownership.

## Misconception 2: "Project Default Versus User Override" Is The Whole Problem

That framing is too small.

The actual system needs layered configuration, not just a single override mechanism. Otherwise every new option becomes a special case.

## Misconception 3: A UI Dropdown Equals User Control

It does not.

If the UI control is not backed by:

- a server-recognized schema
- validation
- persistence rules
- conflict resolution

then it is just a local convenience widget.

## Misconception 4: All Existing Config Values Should Be Exposed Through UI

They should not.

Some values are internal tuning parameters.
Some are operational or security-sensitive.
Some are dangerous without workflow support.

A mature configuration surface is curated, not exhaustive.

## Non-Obvious Problems The Current Code Already Reveals

The current implementation reveals several concrete issues that a foundational configuration system should solve.

## Split-Brain Collection State

The UI persists a collection field in the sidebar, but chat uses a hardcoded collection name.

This demonstrates a lack of shared application settings state between:

- sidebar inputs
- chat requests
- ingestion workflows
- backend defaults

## Backend Config Namespace Drift

`healthCheck.js` checks `config?.AI_Models?.Ollama_Endpoint`, while the actual active config schema uses `RAG.OllamaUrl` and `Ollama.ServiceUrl`.

This is a sign that parts of the codebase do not yet depend on a formalized, versioned configuration contract.

## Runtime Configuration Is Not Discoverable Through API

The API exposes behavior, but not the settings model behind that behavior.

There is no first-class endpoint for:

- current effective settings
- available user-editable settings
- installed versus configured models
- collection compatibility
- which values are defaults versus overrides

This makes the UI guess instead of reflect.

## Browser Persistence Is Acting As A Shadow Settings System

`localStorage` is currently doing useful work in the sidebar, but it is doing it outside the server’s awareness.

This creates the risk of:

- stale local values
- broken portability across machines
- inconsistent behavior between users and browsers
- UI choices that imply server-side persistence when none exists

## Principles For A Better Configuration System

The following principles should guide the design.

## Principle 1: Effective Settings Must Be Observable

The app should be able to answer:

- what the current setting is
- where it came from
- whether it is editable
- whether it is compatible with the current context

Without that, troubleshooting becomes guesswork.

## Principle 2: Preferences Must Be Separated From Contracts

A preferred chat model is not the same kind of thing as the embedding model of a collection.

The system should never flatten these into the same category of "settings".

## Principle 3: The UI Should Reflect Server Truth

The frontend should request settings metadata from the server rather than reverse-engineering it from incidental endpoints.

## Principle 4: Dangerous Changes Need Workflow, Not Just Mutation

Changing a chat model can often be immediate.

Changing an embedding model should likely lead to a guided workflow such as:

- create a new collection
- reindex an existing collection
- duplicate collection with a new embedding model

## Principle 5: Every Exposed Setting Should Have A Reason To Exist

Settings should be introduced when they:

- improve user agency
- support experimentation
- reduce hardcoded behavior
- unlock important deployment or workflow scenarios

Settings should not be introduced just because a value happens to exist in a config file.

## Strong Candidates For Early User-Accessible Configuration

These are the strongest initial configuration candidates because they deliver value while carrying manageable risk.

## Tier 1: Safe And High-Value

- active collection for chat
- preferred chat model
- default retrieval mode
- `TopK`
- `MaxContextTokens`
- `MinScore` within validated bounds

These settings directly affect user experience and are already conceptually close to the chat workflow.

## Tier 2: Useful But Needs More Validation

- hybrid lexical weight
- filtered-vector overfetch
- hybrid overfetch
- chunk size
- chunk overlap

These settings can be valuable, but some of them affect ingestion quality or retrieval stability and therefore need stronger validation and explanation.

## Tier 3: Advanced Or Workflow-Driven

- embedding model
- collection schema evolution
- browse root configuration
- environment-derived operational settings

These should not be treated as simple toggles.

## Recommended Foundational First Step

The best first step is not "add more settings to the sidebar."

The best first step is to create a formal settings surface in the backend and then let the UI consume it.

That first step should likely include:

1. a settings schema
2. a settings read endpoint
3. a distinction between effective values and defaults
4. mutability metadata
5. compatibility metadata for model and collection selection

The first safe settings surface should focus on runtime chat behavior, not index-shaping ingestion contracts.

## What This Means For The Example Use Case

For the specific example of using a specific model confirmed to be on the machine, the application should likely support the following behavior.

### Chat Model

The user can:

- see all installed chat-capable models
- see which model is the project default
- choose a different preferred model
- use a model for this session or persist it as a user preference
- call the same behavior through both API and UI

This is a strong fit for the first implementation pass.

### Embedding Model

The user should not simply be allowed to switch the active embedding model globally and expect everything to work.

Instead, the app should surface:

- the embedding model associated with each collection
- whether the currently selected collection is compatible with the requested embedding model
- whether reindexing is required
- what workflow is available to make the change safely

This still puts configuration in the hands of the user, but it does so honestly.

## Proposed API Direction

The app would benefit from a small, explicit configuration API surface.

Possible starting points:

- `GET /api/settings`
- `GET /api/settings/schema`
- `PATCH /api/settings`
- `GET /api/collections`
- `GET /api/models`

The important part is not the exact endpoint naming. The important part is that the API should expose:

- effective value
- default value
- source of truth
- editable status
- validation rules
- compatibility notes

`/api/models` already exists and is useful, but it currently answers only part of the question. It knows what is installed and which configured models are required. It does not yet describe settings ownership or compatibility by collection.

## Proposed UI Direction

The UI should evolve from a component-local control model to a settings-driven model.

That means:

- the active collection should come from shared application settings state
- the selected chat model should come from shared application settings state
- the settings UI should distinguish between "default", "current", and "effective"
- advanced settings should be progressively disclosed
- dangerous settings should include explanation and next-step actions

A good experience would make it impossible for the user to confuse:

- the project default
- the current session value
- the collection contract
- the effective runtime value after overrides

## Suggested Phased Implementation Order

## Phase 1: Establish The Contract

- define a backend settings schema
- add `GET /api/settings`
- return effective chat settings and collection selection metadata
- remove hardcoded collection drift in the UI
- make the UI consume server-backed settings state

## Phase 2: Add Safe Mutation

- allow updating preferred chat model
- allow updating active collection
- allow updating retrieval mode and bounded retrieval tuning
- persist those values intentionally rather than incidentally

## Phase 3: Add Compatibility-Aware Collection Metadata

- expose collection list and metadata
- expose collection embedding model
- expose compatibility warnings for proposed changes
- teach the UI to explain why some settings cannot be switched freely

## Phase 4: Introduce Advanced Workflows

- reindex with new embedding model
- duplicate collection using a new embedding model
- manage collection-specific defaults

## Key Decisions Still Needed

Before implementation, the team should make a few explicit decisions.

1. Is the primary authoritative runtime path the Node/React app, with PowerShell treated as legacy-support tooling, or must both remain equal citizens?
2. Where should persisted mutable settings live?
3. Are user preferences machine-local, browser-local, or shared across clients on the same machine?
4. Which settings are global defaults versus collection-bound contracts?
5. Does the app want one active collection at a time, or should it move toward multi-collection querying?
6. Should environment variables remain the highest-precedence layer for overlapping fields, even when the UI offers a setter?

## Final Assessment

The request is strategically correct.

This application is ready for a more deliberate user-configuration architecture, and model selection is an excellent starting example because it exposes the deeper truth:

the app already has configuration, but it does not yet have a configuration product.

The correct foundational move is not to expose every value everywhere.

The correct foundational move is to define a layered configuration system that distinguishes:

- runtime preferences
- project defaults
- collection contracts
- operational settings

Once that distinction exists, the app can safely and coherently place more control in the hands of the user through both API and UI.
