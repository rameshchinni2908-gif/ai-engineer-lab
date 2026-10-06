# Seed data

Fixture data so every module has something real to work with on first load, with zero setup
and zero API keys. Nothing here is loaded automatically at server boot — you load it on demand,
against a running instance, with:

```bash
pnpm seed
# or, if you remapped ports (see root README):
API_BASE=http://localhost:8080 pnpm seed
```

This runs [`load.mjs`](./load.mjs), a dependency-free Node script that POSTs every fixture
below to the app's own public HTTP API (the same one documented in `docs/contracts.md`) — it
never touches the SQLite file directly, so it works identically against `pnpm dev` or against
`docker compose up`. Run it once after the API is up; re-running it creates a second copy of
everything (there's no dedup), which is fine for a teaching app but worth knowing.

## What's in here

### `docs/` — a small, internally-consistent corpus (Nimbus Cloud Storage)

Five Markdown documents (~2,700 words total) about a fictional product, **Nimbus Cloud
Storage**, written specifically for this lab — not a real company. `load.mjs` ingests all five
through the full RAG pipeline (chunk → embed with the zero-key Mock provider → index) into a
vector collection named **`nimbus-kb`**, so RAG queries work immediately after seeding.

| File | Purpose |
|---|---|
| `nimbus-overview.md` | General product/architecture background. |
| `nimbus-pricing-2026-02.md` | **Current, authoritative** pricing. |
| `nimbus-pricing-2024-01-ARCHIVED.md` | **Deliberately stale/contradictory** pricing (different price, quota, and member cap for the same plan). Exists specifically so the RAG module's "stale" failure-mode lab has a real conflict to detect, not a synthetic one. |
| `nimbus-security-compliance.md` | Encryption, auth, compliance posture, data residency, audit logging. |
| `nimbus-data-retention-policy.md` | Specific numeric retention windows (trash, version history, account closure, audit logs, legal holds) — good targets for exact-match and "needle in a haystack" / lost-in-the-middle retrieval tests. |

### `evals/` — a dataset, loaded two ways

`nimbus-support-qa.dataset.json` is 18 question/answer cases grounded in the corpus above,
covering overview facts, current pricing, security, retention, one deliberately **out-of-corpus
"miss" case**, and several cases tagged `trap`/`stale` that specifically probe whether the
system (or your prompt) notices the archived pricing document contradicts the current one.

`nimbus-support-qa.cases.csv` is the same 18 cases re-expressed as CSV, following the import
convention documented in `docs/contracts.md` §4 M7 (`id`, `expected`, `tags` [`|`-separated],
`metadata` [JSON] are reserved columns; every other column becomes `input.<columnName>` — here,
just `question`). `load.mjs` creates a *second*, initially-empty dataset and imports this CSV
into it via `POST /evals/datasets/:id/import`, so running the seed script actually exercises the
CSV importer, not just the JSON path.

### `prompts/` — two prompt versions to compare

Two `PromptVersion` fixtures for the same conceptual prompt, named distinctly
(`nimbus-support-assistant-baseline` / `nimbus-support-assistant-grounded`) so an eval run can
tell them apart at a glance:

- **baseline**: a minimal instruction with no grounding requirement and no conflict-handling
  guidance. Expected to sometimes answer pricing questions from whichever document retrieval
  happens to surface, including the archived one, and to guess on the out-of-corpus case.
- **grounded**: explicitly instructs the model to answer only from context, say "I don't know"
  when the context doesn't cover the question, and to detect + call out conflicting
  dates/values when more than one source document disagrees.

Run both as variants of the same `POST /evals/run` against the Nimbus Support QA dataset to see
a measurable score difference, especially on the `trap`/`stale`/`miss`-tagged cases.

**Note on versioning:** the public `POST /prompting/prompt-versions` endpoint always creates
`version: 1` (custom version numbers / parent linkage are only produced by the `PUT` "new
version from an existing one" flow — see `docs/contracts.md` §4 M2). These two fixtures are
therefore created as two independent version-1 rows under two different `name`s, not as v1/v2
of one lineage. That's why they're distinctly named rather than sharing a name.

## If something 404s

Make sure the API is actually reachable at `API_BASE` (default `http://localhost:8787`) before
running `pnpm seed` — the script checks `GET /api/health` first and fails fast with a clear
message (including the two most likely fixes: `pnpm dev` or `docker compose up -d`) if it can't
reach it.
