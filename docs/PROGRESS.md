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

## Wave 2 — Module vertical slices (PARALLEL, 5 agents) — IN PROGRESS

**Status as of 2026-10-05:** all 5 agents launched in parallel, all 5 killed mid-work by session
rate limits (twice), all 5 resumed with precise "what landed / what remains" briefs.
Backends largely done; **frontends were the big gap** (only M1 had a page at resume time).

### Orchestrator-fixed cross-agent integration bug (do not reintroduce)
20 tests were failing with `404` because five module folders **double-prefixed** their route
paths: `/api/embeddings/embeddings/embed`, `/api/evals/evals/datasets`, `/api/agents/agents/run`,
`/api/vector/vector/...`, `/api/mcp/mcp/...`. The registry injects `/api/<prefix>`, so plugin
paths MUST be bare and relative (`app.post("/embed")` → `/api/embeddings/embed`). Six folders got
it right, five did not — i.e. **contracts §9 was ambiguous**, not five independent mistakes.
Diagnosed via Fastify's own `printRoutes()` rather than by reading code. Stripping the duplicate
segment fixed 18 of the 20 failures immediately.
- [ ] **TODO for Wave 3 `architect`: disambiguate contracts §9** — state explicitly that a module
      route plugin declares paths RELATIVE to the prefix the registry injects, with an example.
      This is the single highest-value contract clarification outstanding.

### Orchestrator-fixed obsolete Wave-1 tests (not regressions)
Two tests asserted "no modules exist yet", a premise Wave 2 invalidates by design:
- `apps/api/src/routes/platform.test.ts` — asserted `/api/fundamentals/sample` 404s. Rewritten to
  assert the registry tolerates an absent folder without claiming a specific module 404s.
- `apps/web/src/app/router.test.tsx` — asserted the placeholder for all 11 ids. Rewritten to derive
  the unbuilt set from the SAME `import.meta.glob` the router uses, so it stays correct as pages
  land one at a time, plus a guard against the assertion going vacuous.

### Test count trajectory
Wave 1 end: 127. After the prefix fix + obsolete-test rewrites: **571 (1 failing)**.
The single failure is `apps/api/src/services/evals/cli.e2e.test.ts` — `eval-security-engineer`'s
CLI e2e reusing a persistent `test-cli-e2e.db` across runs so `eval_cases.id` /
`eval_suite_results.dataset_id` collide. It had self-diagnosed this before being killed; it is
now its first priority as the only thing blocking the Wave 2 gate.

### Per-agent state at resume (verified on disk by orchestrator, not from agent reports)

| Agent | Backend | Frontend | Notes |
|---|---|---|---|
| `llm-modules` M1–M3 | routes+services done, tests pass | M1 page only (7 files) | M2 + M3 pages remained |
| `retrieval-engineer` M4–M5 | M4 done (embeddings 14, vector 9, stores 11); **M5 RAG not started** | none | RAG backend + both pages + RAG integration test remained |
| `agent-engineer` M6 | services/agents 34 files, routes+mcp done, sandbox tests passing | none (empty dir) | whole M6 page + remaining tool tests remained |
| `eval-security-engineer` M7–M8 | M7 done (30 files); **M8 guardrails not started** | none | CLI fix + guardrails backend + both pages remained |
| `platform-engineer` M9–M11 | all three done (production 14, advanced 11, checklist 5) | none | all three pages remained |

### Verification I committed to doing personally (not accepting on report)
- [ ] `agent-engineer`'s code sandbox: genuinely no host FS and no network, with tests proving both;
      `http_fetch` SSRF/private-IP blocking
- [ ] `eval-security-engineer`'s attack→defend→re-run: one test showing the SAME attack succeeding
      undefended and blocked defended (literal CLAUDE.md acceptance criterion)
- [ ] `platform-engineer`'s cost levers: whether each "measured saving" is really measured from two
      real runs or simulated
- [ ] `StreamingRegion` actually used in every streaming playground (it is a convention, not an
      enforced guarantee, since `ModuleShell` deliberately does not auto-wrap)

### Original per-module feature checklists (unchanged, still the definition of done)

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

---

## Wave 3 — Hardening (IN PROGRESS)

**Commits so far:** `1a1209c` wave-0 · `ce7fc94` wave-1 · `539149f` wave-2 · `6d10932` wave-2 fixes

### Wave 2 audit → all findings fixed and CONFIRMED by the Wave 3 reviewer
- **BLOCKER (real)** `vm` sandbox was escapable: host-realm intrinsics in the context let
  `Object.constructor("return this")()` reach the worker's real `globalThis` (→ `process`, `Buffer`,
  `fetch`, `import()`). Fixed with `vm.createContext(Object.create(null))`, in-context `console`,
  no `importModuleDynamically`. **11 escape-regression tests added.**
  The original 5 "CANNOT…" tests all PASSED while the hole was open — they only asserted bare
  identifiers were undefined. Lesson: a test asserting the easy version of a security property is
  worse than no test.
  **Re-attacked twice and confirmed closed**, including an empirical repro of the vm2
  `Error.prepareStackTrace`/CallSite CVE pattern (`getFunction()` returns nothing across the `vm`
  boundary on Node 24). Doc comment no longer claims "impossible".
- M4 recorded no Run (contracts §2.3 + only layering violation) → `services/embeddings/embed.ts`
- `batching-sim` asserted a wall-clock latency saving → made timing-independent
- `SyntheticDataLab` lacked `StreamingRegion` → now **17/17** `useSse` consumers
- 4 simplifications disclosed only in code comments → visible UI banners
- 3 contracts drifts corrected (citations path, 2 undocumented routes, §9.1 prefix rule)

### Wave 3 remaining
- [x] `backend-core`: **log redaction inverted to deny-by-default.** Old allow-list covered
      `prompt`/`messages`/`system` but not `text`/`query`/`goal`/`template`/`code`/document bodies —
      dormant (Fastify logs before body parse) but one `log.error({ req })` from a real leak.
      Now redacts all strings except allow-listed safe scalars, enforced at 3 points incl.
      `hooks.logMethod`. Verified by `git stash` that the new test FAILS on the old policy.
      Tradeoff: `ApiError.code` is redacted too (collides with M3's source-code field); correlate
      via `requestId`.
- [ ] `architect`: Docker Compose, README rewrite, seed data (IN PROGRESS)
- [ ] `qa-engineer`: Playwright 5 acceptance flows + web coverage gaps (IN PROGRESS)
- [ ] GATE 3 + commit `feat(wave-3)`
- [ ] Final acceptance check

### `docker compose up` is BROKEN today — reviewer's concrete causes (architect fixing)
1. `apps/web/Dockerfile` never copies an `nginx.conf` → default config, so **every `/api/*` 404s**
   in Docker and deep-route refresh 404s. Orchestrator additionally required `proxy_buffering off`:
   this app is SSE-heavy and nginx buffering would silently break every streaming playground.
2. No healthcheck on `api`; `web`'s `depends_on` lacks `condition: service_healthy`.
3. `api` hard-depends on `qdrant` though `VECTOR_STORE=memory` by default → pull failure blocks boot.
4. `better-sqlite3` native-addon copy across the multi-stage build is unverified.

### README was actively misleading
Said "Wave 0 scaffold… module content lands in later waves" while 11 modules + 708 tests existed.
Rewrite must include an honest **"What's simulated"** section: ANN index trade-offs, mock
`llm_judge`/`pairwise`/RAG metrics (lexical heuristics), judge-bias demos, attention heatmap,
RAG parent-doc sibling chunks, scripted security bot, canned `http_fetch` bodies — and that the
Anthropic/OpenAI/Ollama paths have **never made a live call** in this build (no keys), while Mock
mode is fully tested.

### Verification standard adopted after an orchestrator mistake
I reported "686 tests green" off two runs; the reviewer then found a genuinely flaky test. Since
then: **3 consecutive identical green runs** before any green claim. Root `test` script is
`pnpm -r --workspace-concurrency=1 test` because concurrent package suites oversubscribe this
machine's CPU and produced false failures (incl. in a security test).

---

## Wave 3 findings (as of 2026-10-06)

### `docker compose up` — FIXED and verified end-to-end by the orchestrator
Not taken on report. Ran it, probed the running containers, tore it down:
- `api` healthy, `web` up, **qdrant correctly absent by default** (now behind a compose profile)
- zero API keys: `LLM_PROVIDER=mock`, both key vars empty in the container
- API through nginx (`:8080/api/health`) → `ok=true mode=mock` (**was 404**)
- SPA deep routes `/m/rag/playground`, `/m/agents`, `/glossary` → 200 (**were 404**)
- **SSE through nginx: 23 separate network chunks**, 93 ms first byte, real `logprobs` events —
  streaming, not buffered. Default nginx buffering would have passed a smoke test while breaking
  every streaming playground for real users.
- attack→defend via container: undefended leaks the secret; defended blocked by `injectionClassifier`
- `pnpm seed` → 5 docs into `nimbus-kb`, 2 eval datasets (JSON + CSV twin), 2 prompt versions
- RAG query → 4 real citations; strategies emit `rewrite → retrieve` with inspectable payloads

`architect` found 3 real bugs by actually building (not reasoning): missing `.dockerignore` (host's
Windows-symlinked `node_modules` shadowed the container's), Dockerfile stage ordering breaking the
root `prepare` script, and a runtime stage whose pnpm symlinks dangled (would have broken
`better-sqlite3`).

### Log redaction — FIXED (inverted to deny-by-default)
Old allow-list covered `prompt`/`messages`/`system` but not `text`/`query`/`goal`/`template`/`code`/
document bodies. Dormant (Fastify logs before body parse) but one `log.error({ req })` from a real
leak. Now redacts all strings except allow-listed safe scalars, enforced at 3 points including
`hooks.logMethod` so a top-level spread can't bypass it. Verified by `git stash` that the new test
FAILS against the old policy. Tradeoff: `ApiError.code` is redacted too (collides with M3's
source-code field) — correlate via `requestId`.

### Playwright — 5 acceptance specs ACTUALLY RAN and passed
Chromium installed; all 5 green, repeated 3x including a cold run. Port **5174** (`--strictPort`),
API 8787, isolated `DATABASE_PATH=./data/e2e-playwright.db`. `tsx` without `--watch` deliberately —
the watcher raced the suite's SQLite WAL churn and self-restarted into `EADDRINUSE`.
Root `test:e2e` now `pnpm --filter @ail/web test:e2e` (orchestrator wired it).

### [MAJOR, orchestrator-found] "Try this" presets were broken in 7 of 11 modules
`qa-engineer` reported it in M1 only. I grepped all 11: **six more** define real `PRESET_PARAMS` and
drop them on the floor (`onSelect={(p) => setActivePresetId(p.id)}`) — `prompting`, `structured`,
`embeddings`, `rag`, `evals`, `security`. Only `agents` was ever correct.
CLAUDE.md's "≥3 presets" was **cosmetically satisfied and functionally broken**: the preset
highlights and nothing moves. It survived three audits and an 11-row definition-of-done table that
marked presets PASS everywhere — because the presets *render*. Same failure shape as the sandbox:
checking that the artifact exists, not that it works.
- [x] M1 fixed by orchestrator as the reference implementation (`SamplingLab` gained
      `appliedParams` + an effect; page holds the state). **Two details that matter:**
      checks are `!== undefined` not truthiness (the headline preset sets `temperature: 0`, which
      truthiness would silently skip), and `seed: 42` is pinned (without it, changing temperature
      also changes the RNG draw, so the comparison is confounded and teaches the wrong lesson).
- [x] M2/M3 (`llm-modules`), M4/M5 (`retrieval-engineer`), M7/M8 (`eval-security-engineer`) — all
      landed and **verified on disk by me**, not taken on report: every one of the 6 pages now holds
      `appliedParams` state and passes it down, every child component reads `appliedParams.<field>`
      inside an effect, every `PRESET_PARAMS` entry carries real values (no empty-object
      placeholders, which would have reproduced the bug in a new disguise), and each module has a
      test whose *name* asserts a control's value changes rather than just `activePresetId`.
      Both the M4/M5 and M7/M8 agents were killed by the session limit **after** writing the code,
      mid-verification — so their work was complete but unreported. I inventoried disk state
      rather than re-dispatching, which would have duplicated finished work.
- Legitimately NOT bugs: `production`/`advanced`/`checklist` define no params and present presets as
  descriptive walkthroughs (`production` already shows "Suggested walkthrough").

### [BLOCKER-class, found by strengthening a weak test] `embed.ts` never records its error Run
`apps/api/src/services/embeddings/embed.ts:46` — the `if (!provider.embed) throw` guard sits
**before** the `try` at :54 whose `catch` at :82 calls `insertRun({ status: "error" })`. So when a
provider implements no embeddings at all, **no Run is persisted**, contradicting the test's own
docstring *and* contracts.md's "a failed provider call still records an error Run" invariant.
This is the payoff for the whole weak-assertion exercise: the old test only checked that the promise
rejected, which it did — so it passed while the Run was silently never written. `qa-engineer`
correctly left the test RED rather than weakening it back. I verified the line order on disk myself
before dispatching. → `retrieval-engineer` (production code, not the test).

### Still open
- [~] `AttackPlayground` config race — **fixed** (`eval-security-engineer`): one
      `userInteractedRef`, flipped by either a hand toggle or a preset click (a preset *is* user
      intent, just expressed in one click instead of twelve), checked in both places that write
      `config`. A late `GET /guardrails/config` response can now only seed the initial value, never
      overwrite a choice the user already made.
- [x] `ModuleShell` overlap — **fixed, and my diagnosis was wrong.** I guessed "breakpoint too low
      or missing `min-width: 0`". `frontend-shell` measured it instead: the 3-column grid math is
      exact at 1280 (992px available → 320/280/360 + two 16px gaps, zero track overflow) and sound
      at 1024/1440/1920. The real cause was **unclipped overflow of a descendant**:
      `ui/select.tsx`'s `SelectTrigger` rendered `{children}` as a bare flex child with no
      `min-w-0`/`truncate`, so a long label forced the button past its track; and the center column
      had `min-w-0` on *itself* (which only protects the element, not a misbehaving child) but no
      `overflow-x-hidden`. The too-wide child painted into the aside's area, and the aside — being
      the later DOM sibling — took the click. Culprit confirmed: Security's "Enable all (fully
      defended)" button. Verified empirically by `git stash`ing the fix to reproduce a real
      `locator.click()` timeout, then restoring it. It **declined to raise the breakpoint**, which I
      had suggested: unnecessary once the overflow was contained, and an unrequested behaviour
      change. Correct call, and the right instinct to push back on the orchestrator's guess.
      Test: `components/ModuleShell.test.tsx` (4 tests), 3 of which it confirmed fail against the
      old code. It states plainly that jsdom has no layout engine, so the unit test proves the
      structural class contract and **not** pixel non-overlap — that rests on the Playwright check.
- [x] 10 weak assertions → `qa-engineer`: all 10 strengthened, none a false positive. 9 now pass on
      the harder assertion; **#10 caught a real product bug** (below). The `$0`-rate family now
      asserts exact `tokens × non-zero catalog rate` products, so a dropped multiplication fails.
      `cache-sim`'s wall-clock flake removed the same way `batching-sim`'s was (counts +
      `Number.isFinite`, never `elapsed >= 0`). `repair.integration.test.ts` now forces exactly 2
      attempts with a schema that can never validate, so the `parentRunId` assertion always runs.
      Confirmed over 3 consecutive identical api runs: 634 pass / 1 fail, deterministic, not flaky.
      ORIGINAL FINDING, for the record: Sharpest sub-finding: several "cost is computed from the
      catalog, not invented" tests assert against a **$0-rate** model, so `toBe(0)` is
      indistinguishable from a hardcoded zero — i.e. the "measured savings" claim partly rests on
      assertions that cannot fail. Also `repair.integration.test.ts:55-72` wraps its only real
      assertion in an `if` branch that never executes.
- [x] `apps/web/__probe{,2,3,4,5}.mjs` scratch probes deleted once `frontend-shell` was done with them.
- [x] `embed.ts` error-Run fix (`retrieval-engineer`): guard moved inside the `try` so the existing
      `catch` records the error Run and re-throws; HTTP 422 still propagates, no double-insert.

### [orchestrator-found] The "3 consecutive green runs" standard was being met by hand
`retrieval-engineer` reported 3 green runs **but disclosed** it had deleted a scratch SQLite file
before each one. That disclosure was the valuable part, so I tested the claim: run 1 green, run 2
**fails** with "expected 1, got 2". 31 api test files pin a fixed `DATABASE_PATH` under `data/`, those
files outlive the process, and `embed.test.ts` asserts an exact COUNT for a static `feature` tag — so
rows accumulate and a *correct* fix looks broken on the second run. Worse, it made the repeat-run
standard itself unachievable without manual cleanup, quietly voiding the reason for running a suite
three times at all.
Fixed centrally in `apps/api/vitest.global-setup.ts` (wipes `data/test-*.db*` once per suite run,
scoped by prefix so `lab.db` / `e2e-playwright.db` / `pw-test.db` survive) rather than per-file, so a
newly added test cannot reintroduce it by forgetting its own teardown.
**My own first version of that fix broke the entire suite**: `rmSync` hit an EPERM lock on a stale
`test-debug-cli2.db`, and a throwing `globalSetup` aborts collection and reports "no tests" — a
tidy-up problem turned into a total suite outage. Cleanup is now best-effort per file: it must never
be able to fail a run. Verified: 3 consecutive **unassisted** api runs, 635/635 each.
- [x] `Element.prototype.scrollIntoView` stubbed in `apps/web/src/test/setup.ts`. M4's Embeddings page
      legitimately scrolls to the lab section a preset targets; jsdom implements no layout and so has
      no such method, and the call sits in a React handler, so it failed the whole file as an
      uncaught exception. Stubbed the environment rather than removing a real feature to suit the
      runner. The stub is a no-op and proves nothing about scrolling — noted in the comment so no
      future test claims otherwise.
### GATE 3 — PASSED
All four CLAUDE.md gate steps, run by me from the repo root:
| Step | Result |
|---|---|
| `pnpm typecheck` | exit 0 (shared + api + web) |
| `pnpm lint` | exit 0 (`--max-warnings=0`) |
| `pnpm test` | **738 passed / 0 failed** — 12 shared + 635 api + 91 web |
| `pnpm build` | exit 0 (only a pre-existing >500kB chunk advisory) |
Repeat-run standard met: **4 consecutive full-repo green runs**, counts verified identical on the
first and last. Unassisted — no manual cleanup between runs, which is only true because of the
`vitest.global-setup.ts` isolation fix above.

### Playwright acceptance specs — 5/5, and both workarounds deleted
All five CLAUDE.md acceptance flows pass against a real server, **3 consecutive runs**.
The valuable part is what I removed rather than what passed. Each spec had carried a workaround
documenting a live bug; both bugs are now fixed, so the workarounds were deleted and the specs turned
into regression tests for the fixes:
- Dropped `test.use({ viewport: 1920x1200 })`. The suite default is `devices["Desktop Chrome"]` =
  **1280x720**, the exact viewport where the inspector swallowed the click. Its absence is the test.
- Deleted the `await configResponse` wait. The spec now **races** `GET /guardrails/config` on purpose,
  as a fast user on a slow network would, and passes because user intent is recorded before it lands.
- No `force: true` anywhere: a forced click would mask a return of the overlap, which is the opposite
  of what that line is for.
Also rewrote both "PRODUCTION BUG (reported, not fixed)" comment blocks, which were now false and
would have told a future reader these bugs were still open.
Had to kill two leftover dev servers (PIDs on 5174/8787) from an agent's Playwright session that were
holding `e2e-playwright.db` and the ports.

### [BLOCKER, reviewer-found, reproduced live by me] Pino redaction bypassable on EVERY 4xx/5xx
CLAUDE.md non-negotiable: *"Never log raw prompts containing PII."* It was bypassable app-wide.
`logger.ts:56-60`'s `hooks.logMethod` sanitizes only `inputArgs[0]`, the pino **merge object**. Pino's
second argument — the **message string** — is never touched, and `error-handler.ts:27` passes
`err.message` as exactly that on every 4xx. `validation.ts:17` folds Zod's `issue.message` into it,
and zod@3.25.76 renders an invalid-enum failure by **echoing the submitted value verbatim**.
`ProviderIdSchema` is a `z.enum` on nearly every generation route. Separately `err` is skipped by the
sanitizer (`SERIALIZER_OWNED_TOP_LEVEL_KEYS`) on the assumption a dedicated serializer owns it, but
`logger.ts` defines only `serializers.req`/`body` — **there is no `serializers.err`**, so pino's stock
serializer writes `err.message`/`err.stack` raw on the `:26`/`:62` paths.

**I reproduced it against a live server rather than taking the report on trust** (port 8899,
`LOG_LEVEL=info`, POST `/api/fundamentals/sample` with a sentinel in `providerId`). The emitted line,
two fields side by side:

    {"level":40,...,"code":"[redacted]","requestId":"...","msg":"body.providerId: Invalid enum value.
     Expected 'anthropic' | 'openai' | 'ollama' | 'mock', received 'PIILEAK-SENTINEL-ssn-123-45-6789'"}

The sanitizer redacted the **harmless error code** and passed **raw attacker-supplied text** through in
the adjacent `msg`. Deny-by-default working loudly in one field and absent in the next.

Why it survived: `app.redaction.test.ts`'s 4 green redaction tests only exercise
`req.log.info({ req }, "received request")` — a **static literal** message. They never test the
two-arg `log.warn(obj, dynamicString)` or `log.error({ err }, msg)` shapes production uses on every
error path. Fifth instance in this build of a test asserting the easy version of its property.
→ `backend-core`: sanitize the message string in `logMethod` (systemic, covers future call sites),
add `serializers.err`, and stop passing user text as the pino message in `error-handler.ts`. Plus a
test using the real two-arg shapes **with a positive control** that must appear.

### [MINOR, reviewer-found] Last truthiness-check holdout
`AgentPlayground.tsx:82-84,88` still uses `if (appliedParams.goal)` etc. while `budgetUsd` in the same
effect correctly uses `!== undefined`. Benign today (no shipped preset uses a falsy value) but it is
the exact pattern that broke presets in 7 of 11 modules, and it is now the only file left with it.
→ `agent-engineer`. Reviewer swept all 24 `appliedParams` files to confirm this is the only one.

### Reviewer verdict on everything else: held up
Sandbox (no bypass found on paper, incl. prototype-walk and `import()`), HTTP-fetch allow-list
(deny-by-default AND makes no real network call, so redirect/rebind SSRF is structurally moot), SSE
`done` guarantee (`try/finally` verified across all 10 route files), citations at
`Run.metadata.citations`, cost-math honesty (remaining `toBe(0)` cases are genuinely-$0 models, called
out in-comment), `overflow-x-hidden` clips nothing that needs scrolling (modules manage their own
`overflow-x-auto`), `truncate` keeps full text in the DOM for assistive tech, global-setup regex cannot
match `lab.db`/`e2e-playwright.db`/`pw-test.db`, rate limiting + `x-request-id` registered app-wide.

### Both reviewer findings fixed and INDEPENDENTLY verified by me
**BLOCKER (redaction) — closed in three layers**, none redundant (each closes a separately
exploitable gap: merge object vs. message argument vs. the `err`-exempt serializer path):
1. `logMethod` now sanitizes `inputArgs[1]` when it is a string — systemic, covers every present and
   future call site rather than the two that happened to be found.
2. New `serializers.err` sanitizes `err.message` + the `Error:` line of the stack.
3. `error-handler.ts` stops passing user text as the pino message at all: fixed literal
   `"request failed"`, detail moved to a non-allow-listed `errorMessage` key.
The agent reverted its fix to confirm the 3 new tests actually fail against the old code — the right
instinct, since a regression test never seen red is just an assertion.

**I re-ran my own live reproduction rather than accepting the report.** Results, each with a positive
control so a silent probe failure could not masquerade as success:
| Probe | Result |
|---|---|
| `incoming request` / `request completed` present (positive control) | 2 / 3 — probe genuinely reads the log |
| Original sentinel in `providerId` | **0** |
| Bare `123-45-6789` | **0** |
| New log line | `"errorMessage":"[redacted]","msg":"request failed"` |
| Client response still names the invalid field | yes — `ApiErrorSchema` contract intact |
I also tested a vector nobody had: **PII in a SUCCESSFUL request's prompt** (SSN + email in
`messages[0].content`), which is what CLAUDE.md's rule is literally about. 0 occurrences of all three
markers, positive control passing. Redaction scope is pattern-based, not semantic — stated honestly in
the acceptance report, since names/addresses in free text are NOT redacted.

**MINOR (truthiness) — fixed.** `AgentPlayground` now uses `!== undefined` throughout; the agent
confirmed its new tests fail against the truthiness version, and was precise about the limits rather
than overclaiming: the `maxSteps: 0` test exercises the prop contract (the real input clamps to 1), and
`toolAllowList` has no falsy value to test at all since arrays are always truthy.

### GATE 3 (final) — PASSED
| Step | Result |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm test` | **743 passed / 0 failed** (12 shared + 638 api + 93 web), **3 consecutive identical runs** |
| `pnpm build` | exit 0 |
| `pnpm test:e2e` | 5/5 acceptance specs, at 1280x720 with both workarounds deleted |

### Verified acceptance evidence (live probes, not test-suite inference)
- Zero keys: `/api/health` → `mode: mock`, anthropic/openai `false`, db ok.
- SSE: 20 `token` + 20 `logprobs` frames, `run_start`, `run_complete`, **exactly one** `done`.
- Temperature criterion, same seed 42, same choice point: temp **0.0** → `offers` p=1.000 with every
  alternative collapsed to 0.000 (correct point-mass limit); temp **1.5** → chose `broadly` p=0.116
  **over** `offers` p=0.336. Genuine softmax behaviour, picking a lower-probability token.
- **Never exercised live: the Anthropic/OpenAI/Ollama paths.** They `fetch` real endpoints and compile,
  but no request has left this machine; only `estimateCost` arithmetic is tested. Mock is the only
  provider with evidence behind it.
- Minor, not a defect: `/api/health` reports `ollama: true` with no Ollama running. Deliberate — the
  field is `configured`, not `available`, with a comment that reachability is separate — but readable
  as "available".
