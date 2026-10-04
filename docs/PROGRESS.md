# AI Engineer Lab — Build Progress

> **Orchestrator: READ THIS FILE FIRST** after any restart or context compaction, then resume at the
> first unchecked item. Update after every step. Gate = `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

**Run started:** 2026-10-04
**Branch:** master
**Mode:** fully autonomous multi-agent build (orchestrator delegates, writes little code)

---

## Environment prerequisites

- [x] Node 20+ present (v24.15.0)
- [x] pnpm installed (9.15.9, via `npm i -g pnpm@9`)
- [x] Docker CLI present
- [x] git repo initialized, user.name/user.email set
- [x] `docs/PROGRESS.md` created

---

## Wave 0 — Foundations (SERIAL, agent: `architect`)

Split into **0a** (scaffold/schemas/DB) and **0b** (contracts.md) because one brief covering both
was too large for a single agent pass.

### Wave 0a — scaffold (DONE, gate verified by orchestrator)
- [x] pnpm monorepo: `apps/web`, `apps/api`, `packages/shared`, `pnpm-workspace.yaml`
- [x] Shared tsconfig / eslint flat config / prettier / vitest config
- [x] `packages/shared` Zod schemas: Run, Trace/Span, Message, Tool, PromptVersion, Dataset,
      EvalCase, EvalResult, Document, Chunk, AgentStep, GuardrailConfig (+ Explain, Sse, Retrieval,
      Model, Generation, Guardrail report) — ~110 exported schema/type/interface names
- [x] `packages/shared` interfaces: `LLMProvider`, `VectorStore` (+ GenerateRequest/Result, VectorPoint,
      IndexConfig, MODEL_CATALOG, estimateCostUsd, findModel)
- [x] SQLite schema + idempotent migration runner (better-sqlite3 ^12 native addon verified working;
      `node:sqlite` fallback wired in `apps/api/src/db/open.ts` but NOT active, so no ADR needed)
- [x] `.env.example`, docker-compose skeleton (web/api/qdrant), Dockerfiles on node:22-bookworm-slim
- [x] Fastify skeleton w/ `/health`, Pino redaction, CORS, `app.inject()` test
- [x] Vite + React 18 + Tailwind v3 + shadcn conventions, 11-module placeholder home page
- [x] Empty-but-valid app: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green

### Wave 0b — contracts (DONE)
- [x] `docs/contracts.md` — 364 lines, 71 routes across 11 modules, SSE event shapes (all 11
      variants), file-ownership map, mock-mode guarantees, change log
- [x] `AuditLogEntry` schema added to `@ail/shared` (audit_log table had no shared type)
- [x] **GATE 0 green** (typecheck / lint / test 12 / build — verified twice: by architect and by reviewer)
- [x] `reviewer` pass on Wave 0: **0 BLOCKER**, 4 MAJOR, 5 MINOR
- [x] Wave 0c: amendments from review (DONE, see below)
- [x] commit `feat(wave-0)` — see below

### Wave 0c — review amendments (DONE)
All five landed; gate re-verified green by orchestrator; committed as `1a1209c feat(wave-0): ...`
(73 routes total, M9 now 8). Architect also closed two further ownership gaps it found:
`mcp` → `agent-engineer`, `checklist` → `platform-engineer`.
Orchestrator additionally moved `apps/web/src/content/modules.ts` →
`apps/web/src/app/modules.config.ts` to resolve a nav-vs-content ownership collision between
`frontend-shell` and `content-writer`, and added `.gitattributes` (`* text=auto eol=lf`) before
the first commit to stop CRLF churn across 10 agents.

<details><summary>original 0c item list</summary>
Routed to `architect` (owns `packages/shared/**` + `docs/contracts.md`):
- [ ] M9 cost lab: add `batching-sim` + `context-trim-sim` (2 of 4 mandated levers were missing)
- [ ] M9 reliability-sim: cover idempotency + queues
- [ ] `AgentLimitsSchema`: add loop-detection + HITL-approval input knobs (only outcomes existed,
      so `agent-engineer` would have had to edit a schema it does not own)
- [ ] `/advanced/reasoning-presets`: remove the deferred implementation decision
- [ ] **NEW §9 module registration conventions** — orchestrator-found gap the review missed:
      no owner for the API `app.ts` registry or the web router, so 5 Wave-2 agents would either
      collide on 2 files or never get wired in. Convention: module owns
      `apps/api/src/routes/<module>/index.ts` (default-export Fastify plugin) and
      `apps/web/src/modules/<moduleId>/index.tsx` (default-export page); registry + router written
      ONCE in Wave 1 with guarded/lazy imports that degrade gracefully when a module is absent.

Routed to `backend-core` in the Wave 1 brief (it owns those files):
- [ ] MAJOR: Pino redaction paths too shallow — `*.messages` etc. won't match `req.body.messages`,
      so a PII prompt could be logged. Needs explicit multi-level paths + a test asserting redaction.
- [ ] MINOR: CORS `origin: true` reflects any origin — scope to configured web origin via env.
- [ ] MINOR: no `guardrail_config` / `kv_settings` table for persisted `GuardrailConfig`.

Deferred to Wave 3 `architect` (already TODO-marked in the Dockerfiles):
- [ ] nginx proxy conf, node_modules copy verification, container healthchecks

</details>

- [x] commit `feat(wave-0): monorepo scaffold, shared contracts, SQLite, API/SSE route table` (`1a1209c`, 106 files)

---

## Wave 1 — cross-agent seam (decided before launch)

Cross-agent seam decided up front so the three can run without collisions:
`content-writer` owns `apps/web/src/content/types.ts` defining `GlossaryTerm`, `LearnBlock`,
`ModuleLearnContent`, `Pitfall`, `QuizQuestion`, `PresetCopy`, `ModuleContent`, and a barrel
exporting `MODULE_CONTENT: Record<ModuleId, ModuleContent>` + `GLOSSARY: GlossaryTerm[]`.
`frontend-shell` codes against that exact surface. Both briefs contain it verbatim.
`backend-core` additionally publishes `docs/backend-api.md`; `frontend-shell` publishes
`docs/component-api.md` — those two docs are what the five Wave 2 agents build against.

---

## Wave 1 — Platform (PARALLEL: `backend-core`, `frontend-shell`, `content-writer`) — COMPLETE

### backend-core — DONE
- [x] `LLMProvider` impls: Anthropic, OpenAI, Ollama (real REST/NDJSON wire formats via plain `fetch`,
      no vendor SDKs) + MockProvider behind a registry
- [x] **MockProvider sampling is real softmax math** — orchestrator verified the tests assert:
      temp 0 = argmax regardless of topP/topK; `avgChosenProb(temp 1.8) < avgChosenProb(temp 0.2)`;
      `topK=1` and near-zero `topP` collapse to the exact greedy string. Logprobs computed from the
      full pre-truncation distribution. This is what makes the M1 acceptance criterion real in Mock mode.
- [x] Deterministic `embed()` with similarity ordering (for M4/M5)
- [x] Token + cost accounting (`approxTokenize` shared so M1 reuses it, not reimplements)
- [x] Run recording + replay + compare; `/api/runs`, `/api/traces`, `/api/health`, `/api/models`,
      `/api/providers`, `/api/explain-run`
- [x] SSE helper per contracts section 2.1, central error handler, Zod validation plugin
- [x] Per-IP rate limit (`@fastify/rate-limit`), request IDs, `withSpan()` OTel tracing helper
- [x] `explainRun()` deriving factors from real run numbers, depth-aware
- [x] Wave-2 module registry with guarded dynamic imports (boots with zero module folders)
- [x] `docs/backend-api.md` published for Wave 2
- [x] **Wave 0 security fixes, all three done** — Pino multi-level redaction + a test asserting the
      captured log stream contains neither the PII prompt nor a key value; CORS scoped to
      `WEB_ORIGIN`; `kv_settings` table for M8's `GuardrailConfig`
- [x] 67 api tests

### frontend-shell — DONE
- [x] Router + nav for 11 modules, URL-synced tabs (`/m/:moduleId/<tab>`), `/glossary`, `/runs`, 404
- [x] `<ModuleShell>` (Learn | Playground/Experiments/Pitfalls | Inspector+Why), responsive, persisted collapse
- [x] `<RunInspector>`, `<CompareView>` + hand-rolled LCS word-diff, `<WhyThisHappened>`,
      `<GlossaryTerm>`/`<AutoLinkedText>`
- [x] Difficulty toggle + `useDifficulty()` (`isAtLeast`, `pick`)
- [x] `<ProviderModelSelector>` (defaults to mock), `useSse` hook, TanStack Query + typed `lib/api.ts`
- [x] Dark/light with no-flash boot script, keyboard shortcuts + help dialog, command palette,
      skip link, 20 `components/ui/` primitives (no new deps), 6 persisted Zustand stores
- [x] a11y: skip link, landmarks, focus rings, `aria-live`, reduced-motion, AA tokens both themes
- [x] `docs/component-api.md` published for Wave 2
- [x] 36 web tests
- [x] Verified builds + routes with **zero** files in `src/modules/` (placeholder path), and
      round-tripped a temp module to prove auto-pickup

### content-writer — DONE (M11 follow-up in progress)
- [x] Glossary: **172 terms** (orchestrator verified: 172 unique ids, 0 duplicates, 0 broken `related`)
- [x] Per-module Learn in 3 genuinely distinct depths + `explain`/`underTheHood`/`seniorGotchas`
- [x] Pitfalls: 4-5 per module (symptom, cause, fix)
- [x] Quizzes: exactly 5 per module, all 11 modules
- [x] Presets: 4-5 per module
- [x] Compiled clean first try with **zero** TS errors despite having no Bash/compiler
- [ ] M11 follow-up: `CHECKLIST_ITEMS` (40+), `DESIGN_SCENARIOS` (5+), `LEARNING_PATH` — additive
      exports closing a gap in the `ModuleContent` shape the orchestrator originally pinned

- [x] **GATE 1 green** — typecheck / lint / build PASS, **115 tests** (12 shared + 67 api + 36 web),
      verified by orchestrator after all three agents stopped
- [ ] `reviewer` pass on Wave 1, BLOCKER/MAJOR fixed
- [ ] commit `feat(wave-1): ...`

### Wave 1 deviations to record (do not re-litigate)
- `frontend-shell` implemented section 9's web router with **`import.meta.glob`** instead of 11 literal
  `React.lazy(() => import(...))` calls. Rationale: literal dynamic imports of non-existent paths
  break the Vite build, whereas glob degrades to a placeholder. This satisfies the intent and is
  invisible to Wave 2 agents (they still just create `modules/<moduleId>/index.tsx` with a default
  export). `architect` should sync contracts section 9 wording in Wave 3.
- `GlossaryPage` made lazy so the router's buildability does not depend on content landing.
- Orchestrator added `WEB_ORIGIN` to `.env.example` (`backend-core` correctly refused to edit an
  architect-owned file — escalation rule working as intended).
- Web main chunk is 527 kB / 162 kB gzip — Vite size *warning*, not an error. Revisit code-splitting
  in Wave 3 once Wave 2 modules land.
- **Real-provider paths (Anthropic/OpenAI/Ollama) have never made a live call** — no keys in this
  environment. Only pure functions unit-tested. Mock mode is fully exercised. Must be stated in the
  final acceptance report.

## Wave 2 — Module vertical slices (PARALLEL, 5 agents)

### `llm-modules` — M1–M3
- [ ] **M1 LLM Fundamentals**: tokenizer visualizer, context-window meter + truncation strategies,
      sampling lab (temperature, top_p, top_k, max_tokens, stop, seed, penalties, N samples,
      logprob bar charts), streaming TTFT/tok-per-sec, model comparison
- [ ] **M2 Prompt Engineering**: prompt anatomy builder, technique demos (zero/few-shot, CoT,
      self-consistency, role, XML delimiters, prefill, chaining), bad to better coach with diff,
      prompt versioning, injection-safe templating
- [ ] **M3 Structured Output & Tools**: JSON mode vs schema-constrained vs forced-tool, schema editor
      + validation, retry/repair loop viz, tool-calling playground + full message trace, pitfalls
- [ ] 3+ presets + "Why this happened" (real run data) + unit tests + glossary terms registered (M1–M3)

### `retrieval-engineer` — M4–M5
- [ ] **M4 Embeddings & Vector DB**: embedding explorer (2D PCA/UMAP + neighbors), similarity metrics,
      chunking lab (fixed/recursive/sentence/semantic/markdown) with boundary viz, vector playground
      (create/upsert/filter/search/delete), index trade-offs (Flat/HNSW/IVF, M/efConstruct/efSearch),
      hybrid BM25+vector with RRF, reranking before/after, namespaces/multi-tenancy, re-indexing
- [ ] **M5 RAG**: upload (PDF/MD/TXT) parse, chunk, embed, store, retrieve, generate with citations,
      every stage inspectable; query rewrite, HyDE, multi-query, parent-doc, compression, agentic RAG;
      failure-mode lab (miss, ignored, lost-in-middle, stale) + diagnosis/fix;
      RAG vs long-context vs fine-tune guide
- [ ] `InMemoryStore` AND Qdrant behind `VectorStore`; deterministic mock embeddings
- [ ] RAG pipeline integration test
- [ ] 3+ presets + "Why this happened" + unit tests + glossary terms registered (M4–M5)

### `agent-engineer` — M6 + MCP
- [ ] Runtimes: ReAct, plan-and-execute, reflection, supervisor+worker
- [ ] Tools: calculator, web-search mock, vector search, isolated code sandbox, file reader,
      allow-listed HTTP fetcher
- [ ] Memory: short-term, vector long-term, summary — each inspectable
- [ ] Controls: max steps, budget cap, timeout, loop detection, human-in-the-loop approval
- [ ] Live trace timeline + graph view with tokens+cost per step; state-machine view
- [ ] MCP client section exposing server tools to the agent
- [ ] Pitfalls + "when NOT to use an agent"
- [ ] Tests: loop detection, budget caps, sandbox isolation (no host FS/network)
- [ ] 3+ presets + "Why this happened" + glossary terms registered

### `eval-security-engineer` — M7–M8
- [ ] **M7 Evals**: dataset manager (JSON/CSV import/export), metrics (exact, regex, schema validity,
      semantic similarity, LLM-as-judge with editable rubric, pairwise, RAG metrics), eval runs across
      prompt versions x models + results matrix, regressions, cost/latency, judge-bias education and
      calibration, CI CLI exiting non-zero on regression
- [ ] **M8 Guardrails & Security**: vulnerable demo bot (mock tools only) + attack library
      (direct/indirect injection, jailbreak, markdown-image exfiltration, tool abuse, prompt leak);
      toggleable visualized defense layers (input validation, PII redaction, injection classifier,
      instruction hierarchy, delimiter hardening, output moderation, schema enforcement, tool
      allow-list, least privilege, sandbox, rate limit, approval gates); OWASP LLM Top 10 to demos;
      hallucination mitigation, moderation, bias testing, audit logging, prod security checklist
- [ ] Unit tests: all guardrails + evaluators
- [ ] 3+ presets + "Why this happened" + glossary terms registered (M7–M8)

### `platform-engineer` — M9–M11
- [ ] **M9 Production/Cost/Observability**: tracing dashboard (OTel-style spans, latency, tokens, cost
      per feature), cost lab (prompt/semantic/response cache, model routing, batching, context
      trimming — MEASURED savings), reliability (retry/backoff, timeouts, provider fallback, circuit
      breaker, idempotency, queues), versioning/rollout (pinning, shadow, canary, deprecation
      playbook), latency lab
- [ ] **M10 Advanced Concepts**: attention heatmap, pretrain/SFT/RLHF/DPO visual, adaptation decision
      matrix (prompting/RAG/fine-tune/LoRA/distill), multimodal, reasoning models + thinking budgets,
      quantization/local/Ollama, synthetic data
- [ ] **M11 Glossary & Senior Checklist**: guided learning path with progress, quizzes, design-review
      checklist, system-design scenarios with reference architectures
- [ ] 3+ presets + "Why this happened" + unit tests + glossary terms registered (M9–M11)

- [ ] **GATE 2 green**
- [ ] `reviewer` pass on Wave 2, BLOCKER/MAJOR fixed
- [ ] commit `feat(wave-2): ...`

---

## Wave 3 — Hardening (PARALLEL `qa-engineer` + `reviewer`, then SERIAL `architect`)

- [ ] `qa-engineer`: Vitest coverage gaps (providers, chunkers, evaluators, guardrails, agent limits)
- [ ] `qa-engineer`: RAG pipeline integration test
- [ ] `qa-engineer`: Playwright smoke — temperature to probability, RAG build+inspect, agent trace,
      eval across two prompt versions, attack then defend
- [ ] `reviewer`: security + a11y + contract audit, findings fixed
- [ ] `architect`: Docker Compose (web, api, qdrant) working
- [ ] `architect`: README quickstart
- [ ] `architect`: seed data (`seed/**`)
- [ ] **GATE 3 green**
- [ ] commit `feat(wave-3): ...`

---

## Final acceptance check (CLAUDE.md "Acceptance criteria")

- [ ] `pnpm dev` runs web+api in Mock mode with ZERO API keys
- [ ] `docker compose up` runs everything in Mock mode with zero keys
- [ ] Change temperature, see token-probability shifts
- [ ] Build a RAG pipeline, inspect retrieval
- [ ] Run an agent, view its trace
- [ ] Run an eval across two prompt versions
- [ ] Attack a bot with injection, enable defenses, re-run
- [ ] Typed end to end, linted, documented, tests green
- [ ] Honest report of what passes / what is missing

---

## Log

| When | Event |
|---|---|
| 2026-10-04 | Orchestrator start. pnpm 9.15.9 installed. PROGRESS.md created. Wave 0 delegating to `architect`. |
| 2026-10-04 | Session interrupted mid-Wave-0a; work had landed on disk. Orchestrator re-verified gate independently: typecheck/lint/test(11)/build ALL GREEN. better-sqlite3 native addon confirmed loading. Wave 0a marked done. |
| 2026-10-04 | Wave 0b delegated (resumed same `architect` so it retains schema context): write `docs/contracts.md`. |

## Environment / decisions pinned (agents must not deviate)

| Thing | Value |
|---|---|
| Packages | `@ail/shared`, `@ail/api`, `@ail/web` |
| API port | 8787 |
| Web port | 5173, proxies `/api` → `http://localhost:8787` |
| Backend | Fastify 5, zod ^3.23, pino, better-sqlite3 ^12 |
| Frontend | React 18, React Router 6, TanStack Query, Zustand, Tailwind **v3**, Recharts/D3, Monaco |
| Docker base | `node:22-bookworm-slim` (NOT alpine — better-sqlite3 needs glibc) |
| pnpm | 9.15.9; root pkg has `pnpm.onlyBuiltDependencies` for native postinstalls |
| Layering | routes → services → providers/stores (see `docs/architecture-layering.md`) |
