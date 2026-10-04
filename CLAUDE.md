# AI Engineer Lab: Project Memory

## What we are building
**AI Engineer Lab**: an interactive platform that teaches modern AI engineering to SENIOR engineers.
Every concept has three parts on one page:
1. **Explain**: plain-language summary, "under the hood", "senior gotchas".
2. **Do**: live playground with tunable parameters and real actions.
3. **See**: visual results plus a "Why this happened" explanation tied to the ACTUAL run (never generic text).

Modules (11): LLM Fundamentals · Prompt Engineering · Structured Output & Tools · Embeddings & Vector DB · RAG ·
Agents (+MCP) · Evals · Guardrails & Security · Production/Cost/Observability · Advanced Concepts · Glossary & Senior Checklist.
Each module page has tabs: **Learn · Playground · Experiments · Pitfalls**.

## Stack (do not deviate without writing an ADR in docs/adr/)
- Monorepo: pnpm workspaces → `apps/web`, `apps/api`, `packages/shared`
- Web: React 18 + TS + Vite, React Router, TanStack Query, Zustand, Tailwind + shadcn/ui, Recharts/D3, Monaco
- API: Node 20 + TS + Fastify (or Express), Zod, SSE streaming, Pino
- LLM: `LLMProvider` interface → Anthropic, OpenAI, Ollama, **MockProvider** (deterministic; app MUST work with zero API keys)
- Vector: `VectorStore` interface → Qdrant (Docker) + InMemoryStore (zero-setup default)
- Storage: SQLite (better-sqlite3 or drizzle) for runs, traces, datasets, prompt versions, eval results
- Tests: Vitest (unit/integration), Playwright (smoke)
- Infra: Docker Compose (web, api, qdrant), `.env.example`

## Architecture rules
- Layering: `routes → services → providers/stores`. NO business logic in routes.
- All request/response types are Zod schemas in `packages/shared`. Frontend and backend import them; never duplicate types.
- Every generation endpoint streams via SSE and records a **Run** (payload, response, tokens, latency, cost, model, params).
- Every module page uses the shared `<ModuleShell>`: left = Learn (collapsible), center = Playground, right = Run Inspector + "Why this happened".
- Global features: Run Inspector, Compare mode (A/B + diff), Explain This Run, glossary tooltips, Beginner/Intermediate/Senior toggle.
- Explanations come from `explainRun()` service which receives the real run data and params. Mock mode must produce meaningful explanations too.

## Security rules (non-negotiable)
- API keys live ONLY in server env. Never sent to the browser, never logged.
- Never log raw prompts containing PII; Pino redaction paths configured.
- Code-execution sandbox: isolated (worker/vm2-alternative or container), no host FS/network. HTTP fetch tool uses an allow-list.
- Red-team demo bot is deliberately vulnerable but ONLY runs inside the app with mock/test tools. No real side effects.
- Per-IP rate limiting + request IDs on all routes.

## Code conventions
- TypeScript strict. No `any` without a comment. ESLint + Prettier. Conventional Commits.
- Files < 300 lines where practical. Pure functions for chunkers, evaluators, guardrails (easy to unit test).
- Every module ships: ≥3 presets ("Try this"), empty states, loading skeletons, a11y (WCAG AA), dark/light mode.
- Content (Learn text, glossary, quizzes) lives in `apps/web/src/content/<module>/` as typed TS/MDX, not hardcoded in components.

## Commands
- `pnpm install` · `pnpm dev` (web+api) · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e`
- `docker compose up` launches everything.
- **Quality gate** (must pass before any wave is declared done): `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

## Multi-agent orchestration protocol
The main session is the **ORCHESTRATOR**. It plans, delegates to subagents in `.claude/agents/`, integrates, and verifies.
The orchestrator writes little code itself.

1. **Contracts first.** Wave 0 produces shared Zod schemas + provider/store interfaces + API route table in `docs/contracts.md`. Nothing else starts until this exists.
2. **File ownership.** Each agent owns specific paths (see its definition). Agents NEVER edit files they do not own; they request changes via the orchestrator. This prevents merge conflicts when running in parallel.
3. **Waves.** Agents inside one wave run in PARALLEL (multiple Task calls in a single message). Waves run sequentially.
4. **Gates.** After each wave: run the quality gate, run the `reviewer` agent, fix findings, then commit.
5. **Progress file.** Keep `docs/PROGRESS.md` updated (wave status, done, blocked, next). After context compaction or a restart, READ IT FIRST and resume.
6. **Definition of done per module:** Learn + Playground + ≥3 presets + "Why this happened" + unit tests + glossary terms registered.
7. If blocked or the contract must change: stop that agent, update `docs/contracts.md`, notify affected agents. Do not hack around it.

## Waves
- **Wave 0 (serial):** `architect` → monorepo scaffold, contracts, DB schema, docker-compose skeleton, CLAUDE-aligned lint/test config.
- **Wave 1 (parallel):** `backend-core` (providers, mock, runs, SSE, explainRun, rate limit) · `frontend-shell` (ModuleShell, Run Inspector, Compare, tooltips, difficulty toggle, theme) · `content-writer` (glossary 150+ terms, learn-content scaffolding).
- **Wave 2 (parallel vertical slices):**
  `llm-modules` (M1–M3) · `retrieval-engineer` (M4–M5) · `agent-engineer` (M6 + MCP) · `eval-security-engineer` (M7–M8) · `platform-engineer` (M9–M10 + M11 checklists/scenarios)
- **Wave 3 (parallel then serial):** `qa-engineer` (Vitest gaps, integration RAG test, Playwright smoke) · `reviewer` (security + a11y + contract audit) · `architect` (Docker Compose, README quickstart, seed data).

## Acceptance criteria
- `docker compose up` or `pnpm dev` runs everything in Mock mode with zero keys.
- User can: change temperature and see token-probability shifts · build a RAG pipeline and inspect retrieval · run an agent and view its trace · run an eval across two prompt versions · attack a bot with injection, then enable defenses and re-run.
- Typed end to end, linted, documented, tests green.
