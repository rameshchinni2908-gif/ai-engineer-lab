# AI Engineer Lab

An interactive platform that teaches modern AI engineering to **senior engineers**. Every
concept gets three things on one page: **Explain** (plain-language + "under the hood" + senior
gotchas), **Do** (a live playground with real, tunable parameters), and **See** (visual results
plus a "Why this happened" explanation tied to the *actual run you just made*, never generic
text). See [`CLAUDE.md`](./CLAUDE.md) for the full project brief.

Eleven modules:

| # | Module | What you do in it |
|---|---|---|
| 1 | LLM Fundamentals | Tokenizer visualizer, context-window truncation strategies, a sampling lab (temperature/top_p/top_k/seed/penalties) with live logprob charts, streaming TTFT/tokens-per-sec, model comparison |
| 2 | Prompt Engineering | Prompt anatomy builder, technique demos (few-shot, CoT, self-consistency, prefill, chaining...), a bad→better prompt coach with diff, prompt versioning |
| 3 | Structured Output & Tools | JSON mode vs. schema-constrained vs. forced-tool generation, schema validation, a retry/repair loop you can watch, a full tool-calling message trace |
| 4 | Embeddings & Vector DB | 2D embedding projection + neighbors, chunking strategies with boundary visualization, a vector store playground, ANN index trade-offs, hybrid BM25+vector search, reranking |
| 5 | RAG | Upload → chunk → embed → store → retrieve → generate with citations, every stage inspectable, query rewrite/HyDE/multi-query/parent-doc, and a failure-mode lab (miss, ignored, lost-in-the-middle, stale) |
| 6 | Agents (+MCP) | ReAct / plan-execute / reflection / supervisor-worker runtimes, inspectable memory, max-steps/budget/timeout/loop-detection/human-approval controls, a live trace+graph view, an MCP tool section |
| 7 | Evals | Dataset manager (JSON/CSV import+export), exact/regex/schema/semantic/LLM-judge/pairwise/RAG metrics, prompt-version × model comparison matrices, regression detection, judge-bias + calibration labs |
| 8 | Guardrails & Security | A deliberately vulnerable demo bot, an attack library (injection, jailbreak, exfiltration, tool abuse, prompt leak) mapped to the OWASP LLM Top 10, and 12 toggleable defense layers you can turn on one at a time |
| 9 | Production / Cost / Observability | A tracing dashboard, a cost lab with *measured* savings (cache/routing/batching/context-trimming), reliability simulations (retry, circuit breaker, idempotency, queues), a latency lab |
| 10 | Advanced Concepts | Attention heatmap, pretrain→SFT→RLHF/DPO, an adaptation decision matrix, multimodal input, reasoning/thinking budgets, quantization, synthetic data |
| 11 | Glossary & Senior Checklist | 150+ term glossary, a guided learning path, quizzes, a design-review checklist, system-design scenarios |

## Quickstart

```bash
pnpm install
pnpm dev
```

- Web: **http://localhost:5173**
- API: **http://localhost:8787**

That's it — **no API keys are required.** The app is fully functional end to end with
`LLM_PROVIDER=mock` (the default), a deterministic, zero-setup provider that still reacts
correctly to temperature/top_p/top_k/seed so the sampling lab genuinely teaches something, and a
zero-setup in-memory vector store. If you want to call a real provider, copy
[`.env.example`](./.env.example) to `.env` and fill in `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` /
`OLLAMA_BASE_URL` — those are read **only on the server** (`apps/api`); the browser never sees
them and they are never written to logs (see CLAUDE.md's security rules and
`apps/api/src/plugins/logger.ts`'s redaction config). `WEB_ORIGIN` scopes the API's CORS policy
to exactly the browser origin you're serving the frontend from — it does not reflect arbitrary
origins.

Load some real content to play with (a small knowledge base, an eval dataset, two prompt
versions to compare) with:

```bash
pnpm seed
```

See [`seed/README.md`](./seed/README.md) for what that loads and why.

## Quality gate

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

(`pnpm test` runs every package's Vitest suite with `--workspace-concurrency=1` — concurrent
package test runs oversubscribe a typical dev machine's CPU and can produce false failures.)

| Command | What it does |
|---|---|
| `pnpm install` | Install all workspace dependencies |
| `pnpm dev` | Run web + api in watch mode |
| `pnpm build` | Build `@ail/shared` → `@ail/api` → `@ail/web` in order |
| `pnpm typecheck` | `tsc --noEmit` across every package |
| `pnpm lint` | ESLint across every package |
| `pnpm test` | Vitest (unit/integration) across every package |
| `pnpm test:e2e` | Playwright smoke tests |
| `pnpm seed` | Load the `seed/` fixtures into a running instance via its own HTTP API |

## Docker

```bash
docker compose up -d
```

- Web: **http://localhost:8080** (not 5173 — see below)
- API: **http://localhost:8787**

Also fully functional in Mock mode with zero keys. `web`'s nginx serves the built SPA, proxies
`/api/*` to the `api` container (with SSE-safe settings — buffering and caching off, long read
timeouts; this app streams almost everything, and a naive reverse-proxy config silently turns
every streaming playground into one long pause followed by a single dump), and falls back to
`index.html` for any deep client-side route (`/m/rag`, `/m/agents`, ...) so a hard refresh never
404s. `api` has a healthcheck (`GET /api/health`); `web` won't start until `api` reports healthy.

**Why port 8080, not 5173:** on many machines — notably Docker Desktop on Windows, via its own
`wslrelay` process — host port 5173 is already taken, so the `web` container is published on
8080 by default. Override with `WEB_HOST_PORT` (and update `WEB_ORIGIN` to match, or the API's
CORS check will reject the browser) if 8080 is also unavailable to you.

**Qdrant is optional and NOT started by default.** `VECTOR_STORE=memory` is the default, and the
app never requires Qdrant to function — this is deliberate, so a registry outage or offline
environment can never prevent `docker compose up` from giving you a fully working app. Opt in
with:

```bash
docker compose --profile qdrant up -d
# then set VECTOR_STORE=qdrant (e.g. in a root .env) and restart the api service
```

Verified locally: `docker compose build && docker compose up -d` brings up both containers
healthy, `GET /api/health` responds directly on 8787 and through the web proxy on 8080/api,
an SSE generation endpoint streams token-by-token through the nginx proxy (not buffered), a
deep route returns 200 after a hard refresh, and `pnpm seed` against the containerized API
works identically to running it against `pnpm dev`.

## What's simulated (read this before you trust a number)

This is a teaching app, and CLAUDE.md is explicit that invented benchmark numbers are worse than
none. Several features are deliberately illustrative, and are already labeled as such in the
UI where you'll encounter them — collected here in one place for anyone auditing the codebase:

- **ANN index trade-offs** (Embeddings module): Flat vs. HNSW vs. IVF recall/latency trade-offs
  are *simulated* degradation curves driven by the chosen `M`/`efConstruct`/`efSearch` etc.
  parameters, not measurements against a real large-scale ANN benchmark corpus.
- **`llm_judge` / `pairwise` / RAG metrics (`rag_faithfulness`, etc.) under the Mock provider**
  are lexical/heuristic approximations (token overlap, keyword presence), not an actual LLM
  judging anything — there is no model to ask when no provider is configured. They're deliberately
  designed to still be directionally useful for the Evals module's teaching goals (showing what a
  judge *would* reward/punish), but are not a substitute for a real judge call with a real
  provider key configured.
- **Judge-bias demos** (Evals module — position bias, verbosity bias, self-enhancement bias) are
  deterministic, offline *simulations* of each documented bias pattern, not live provider calls
  exhibiting the bias organically. This is intentional: it makes the "before" (naive) vs. "after"
  (mitigated) comparison 100% reproducible regardless of provider/mock mode.
- **The attention heatmap** (Advanced Concepts) is an illustrative approximation (positional
  distance + token similarity), not real attention weights read out of a model — no hosted
  provider API exposes those, including with real API keys configured.
- **RAG's "parent-doc" retrieval strategy** expands a matched chunk by pulling in its sibling
  chunks from the same document, as a parent-document approximation — it is not a separate
  "parent chunk" indexing scheme.
- **The Guardrails module's vulnerable demo bot** replies with a deterministic, scripted string
  (not a live LLM call) when undefended, specifically so the attack/defense demonstration is
  100% reliable regardless of provider/mock mode. Every tool it can "call" (`send_email`,
  `execute_code`, etc.) is a mock with no real side effect — this is non-negotiable per
  CLAUDE.md's containment rule, independent of which real LLM provider you might otherwise have
  configured.
- **The agent `http_fetch` tool** returns canned, deterministic response bodies for its
  allow-listed domains, not live network responses — agents in this app never make real outbound
  HTTP requests.
- **Quantization / cost-lever illustrative figures** (Advanced Concepts, Production cost lab):
  the cost lab's cache/routing/batching/context-trimming savings ARE measured from real simulated
  calls (see `docs/contracts.md` §4 M9), but quantization's size/latency/quality figures are
  explicitly order-of-magnitude illustrations, not benchmark results for any specific model.

**Provider coverage, honestly:** the Anthropic, OpenAI, and Ollama `LLMProvider` implementations
are written against each provider's real wire format (request/response shapes, streaming
protocol, token usage fields) and unit-tested against recorded/mocked HTTP responses, but **have
never been exercised against a live API in this build** — no provider keys were available
during development. The Mock provider is fully, deeply tested (deterministic given
`(model, messages, seed)`, visibly reactive to temperature/top_p/top_k) and is what every
automated test and the seed data above rely on. If you configure a real key, you are the first
person to run that code path for real — please report what breaks.

**The code sandbox**, used by the agent module's `execute_code` tool, is hardened in depth: a
worker thread running a fresh-realm `vm` context with no host intrinsics exposed, no dynamic
`import`, and timeout/terminate/heap caps. It has been adversarially tested twice, including
against the `Error.prepareStackTrace` escape pattern associated with the `vm2` CVEs, and no
escape was found in either pass. That is a meaningfully strong result — but it is a **teaching
sandbox**, not a claim of being a hostile-code-proof jail; treat it accordingly and do not run
it as a general-purpose untrusted-code service outside this app.

## Monorepo layout

```
apps/web         React 18 + TS + Vite frontend (ModuleShell, Run Inspector, Compare mode, ...)
apps/api         Fastify + TS backend (routes -> services -> providers/stores, see below)
packages/shared  Zod schemas + LLMProvider / VectorStore interfaces (the cross-cutting contract)
docs/            contracts.md (full API+SSE route table), ADRs, architecture notes, build log
seed/            Seed data: a document corpus, an eval dataset (JSON+CSV), two prompt versions
```

See [`docs/contracts.md`](./docs/contracts.md) for the full API route table and SSE event
shapes, and [`docs/architecture-layering.md`](./docs/architecture-layering.md) for the backend's
`routes → services → providers/stores` layering convention.
