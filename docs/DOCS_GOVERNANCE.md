---
doc_state: canonical
doc_owner: maintainers
canonical_ref: docs/DOCS_GOVERNANCE.md
last_reviewed: 2026-03-14
audience: contributors
---
# Documentation Governance

## Purpose
This file defines how documentation is managed in this repository to reduce noise while preserving all historical knowledge.

## Document States
Every markdown document in the docs root must declare one state in frontmatter:

1. canonical
2. active-draft
3. historical
4. reference-contract

## Required Frontmatter
Use this block at the top of each document:

```yaml
---
doc_state: canonical|active-draft|historical|reference-contract
doc_owner: team-or-person
canonical_ref: docs/FILE.md (or self)
last_reviewed: YYYY-MM-DD
audience: engineering|security|contributors|ops
---
```

## Authoritative Sources
Canonical and reference-contract docs are the source of truth. Active drafts and historical docs must point to a canonical counterpart.

## Lifecycle Rules
1. New docs require frontmatter and must be listed in docs index.
2. Active drafts older than 30 days must be reviewed for promotion or historical demotion.
3. Historical docs are preserved and never treated as current implementation truth.
4. Contracts (API, SSE, security controls) are reviewed before release changes.

## Folder Conventions
1. Active drafts are stored under `docs/active-drafts/`.
2. Historical documents are stored under `docs/historical/` or `docs/archive/`.
3. If a file is moved from docs root, keep a compatibility stub at the original path with a relocation link.

## Review Cadence
1. Weekly: stale check for active drafts.
2. Monthly: canonical correctness review.
3. Release gate: contract docs reviewed by maintainer.

## Validation Workflow
1. Run `pwsh ./scripts/Validate-Docs.ps1` before every docs-focused pull request.
2. Treat validator failures as hard blockers for merge.
3. Do not bypass missing index entries; every markdown file under docs must be indexed.
4. Keep compatibility stubs indexed and current when files are relocated.

## Deterministic Pruning Routine
1. Classify each candidate file as canonical, active-draft, historical, or reference-contract.
2. Relocate active-draft and historical docs to dedicated folders, then keep a root compatibility stub.
3. Update docs index in the same change as relocation.
4. Re-run validator and require a clean pass.

## Noise Reduction Rules
1. One canonical file per topic.
2. Avoid duplicate design narratives in multiple active files.
3. Place implementation decisions in canonical docs, and keep brainstorm/proposal content in active drafts.
4. Cross-link instead of copy/paste duplication.
