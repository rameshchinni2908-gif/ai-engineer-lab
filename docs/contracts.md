# AI Engineer Lab — API & SSE Contracts

**Status:** authoritative. Wave 1+ agents build against this file. If reality must diverge from
it, stop, propose the change to the orchestrator, edit this file (architect only), bump the
Change Log at the bottom, and re-brief every affected agent before continuing.

---

## 0. How to use this document

1. **Import types only from `@ail/shared`.** Every request/response body that appears more than
   once, or that crosses a module boundary, is a Zod schema exported from `@ail/shared`
   (`import { RunSchema, type Run } from "@ail/shared"`). Never redeclare a shared shape locally.
2. **Route-local DTOs stay local.** A handful of endpoints below return a small, genuinely
   one-off shape (e.g. `/fundamentals/tokenize`'s token list). Those are documented inline in
   this file as plain TypeScript, and the *owning* agent defines them with Zod next to the route
   (e.g. `apps/api/src/routes/fundamentals/tokenize.ts`) rather than bloating `@ail/shared`. If a
   shape turns out to be needed by a second module, promote it to `@ail/shared` and update this
   doc.
3. **File ownership is absolute.** Agents never edit routes/services/components outside the
   paths listed in §5. If you need a route that belongs to another agent, or a contract change,
   stop and ask the orchestrator — do not just add it yourself.
4. **Everything here is additive-by-default.** You may add new fields to a response as long as
   existing fields keep their type (clients must ignore unknown fields). You may NOT remove or
   retype a field, rename a route, or change an SSE event's discriminant without going through
   the orchestrator first.
5. **Mock mode is not optional.** Every route below must produce a correct, deterministic,
   meaningful response when `LLM_PROVIDER=mock` and zero API keys are configured. See §7.

---

## 1. Conventions

- **Base path:** every route is mounted under `/api` (the Fastify app also proxies `/api/*` from
  the Vite dev server at `apps/web`, see `vite.config.ts`). Paths below omit the `/api` prefix
  for brevity in the per-module tables but it is always present, e.g. "`GET /runs`" means
  `GET /api/runs`.
- **Format:** all request and response bodies are JSON (`application/json`), except SSE routes
  (§2) which respond `text/event-stream`, and the eval dataset export route which may respond
  `text/csv` when `?format=csv` is given.
- **Errors:** every non-2xx response body is `ApiErrorSchema`:
  ```jsonc
  { "code": "VALIDATION_ERROR", "message": "params.temperature must be <= 2", "requestId": "req_abc123", "details": { "path": "params.temperature" } }
  ```
  Standard HTTP code ↔ `code` mapping (owning agents may add new `code` values within their
  module's domain, but must keep the HTTP status consistent with this table):

  | HTTP | `code` | Meaning |
  |---|---|---|
  | 400 | `VALIDATION_ERROR` | Zod parse failure on body/query/params |
  | 401 | `UNAUTHORIZED` | reserved; app has no auth in v1, unused today |
  | 403 | `FORBIDDEN` | guardrail/tool-allow-list blocked the action |
  | 404 | `NOT_FOUND` | id does not exist (run, trace, dataset, document, …) |
  | 409 | `CONFLICT` | e.g. prompt version/collection name already exists |
  | 422 | `UNPROCESSABLE` | well-formed but semantically invalid (bad schema, bad chunk config) |
  | 429 | `RATE_LIMITED` | per-IP rate limit exceeded (see rate-limit headers below) |
  | 500 | `INTERNAL_ERROR` | unexpected; logged with requestId, never leaks stack to client |
  | 502 | `PROVIDER_ERROR` | upstream LLM/vector provider failed; `details.providerId` set |
  | 504 | `PROVIDER_TIMEOUT` | upstream provider did not respond within budget |

- **Request ID:** every response (success or error, SSE or not) carries header `x-request-id`.
  If the client sends `x-request-id` on the request, the server echoes it; otherwise the server
  generates one (`randomUUID()`, already wired in `apps/api/src/app.ts` via `genReqId`). The
  same value appears in `ApiErrorSchema.requestId` and in Pino logs for that request.
- **Rate limiting:** backend-core registers a global per-IP limiter (`RATE_LIMIT_MAX` requests
  per `RATE_LIMIT_WINDOW_MS`, from `.env`). Every response includes
  `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` (seconds). A 429 additionally
  includes `retry-after` (seconds).
- **Validation:** all bodies/query/params are parsed with the matching `@ail/shared` Zod schema
  (or a route-local schema per §0.2) via a shared Fastify validation plugin
  (`apps/api/src/plugins/`, backend-core). Query-string numbers/booleans are coerced before
  parsing (Fastify + Zod `z.coerce.number()` etc. at the route-local schema level).
- **Pagination:** list endpoints accept `?page=0&pageSize=20` (0-indexed page, default
  `pageSize=20`, max `100`) and return `PaginatedSchema(Item)`:
  ```jsonc
  { "items": [ /* Item[] */ ], "total": 42, "page": 0, "pageSize": 20, "hasMore": true }
  ```
- **Filtering/sorting:** list endpoints that support filters document them as query params in
  their table row's "Notes" column. Unless stated otherwise, list endpoints sort by `createdAt`
  descending.
- **Naming:** URL paths are kebab-case (`/prompt-versions`, not `/promptVersions`). JSON field
  names are camelCase everywhere (matches the Zod schemas, which already use camelCase).
- **Idempotency:** `POST` routes that create a resource return `201` with the created resource
  and a `Location` header where applicable (prompt versions, datasets, documents). `POST` routes
  that trigger an action/computation (generate, run, replay, attack, sim) return `200`.

---

## 2. SSE protocol

Every **generation, agent, RAG query, eval run, and attack** endpoint streams. This section is
the single source of truth for the wire format — read it before building any streaming route or
the frontend hook that consumes it.

### 2.1 Transport

SSE here is **not** plain `GET` + native `EventSource`, because requests need a JSON body
(messages, params, tool lists, …) and `EventSource` cannot send one. Instead:

- Client sends `POST <route>` with header `Accept: text/event-stream` and a normal JSON body.
- Server responds `200` with `Content-Type: text/event-stream; charset=utf-8`,
  `Cache-Control: no-cache`, `Connection: keep-alive`, and the `x-request-id` header set
  **before** the first byte of the stream (so the client always has it, even if the stream later
  errors).
- The frontend consumes this via `fetch()` + a `ReadableStream` reader (frontend-shell's shared
  `useSse()` hook, documented in `docs/component-api.md` after Wave 1) — **not** `EventSource`.
  Module agents must use that hook rather than writing their own stream parser.
- Each SSE frame is:
  ```
  event: <SseEvent.type>
  data: <JSON.stringify(SseEvent)>

  ```
  (note the blank line terminator). The `event:` field duplicates `SseEvent.type` so
  intermediary tooling (curl, browser devtools, future native `EventSource` polyfills) can
  filter by event name, but **clients must treat the `type` field inside `data` as the source of
  truth**, never the SSE `event:` line alone.
- **Heartbeat:** the server writes a comment line `: ping\n\n` every 15 seconds while a stream is
  otherwise idle (e.g. waiting on a slow provider), to defeat proxy/load-balancer idle timeouts.
  Comment lines (`:` prefix) carry no event and MUST be ignored by the parser.
- **Termination:** every stream ends with exactly one `event: done` / `data: {"type":"done"}`
  frame, then the HTTP response closes. A connection that closes **without** a prior `done` event
  (network error, server crash) must be treated by the client as a failed run — SSE streams in
  this app are **not resumable**; there is no `Last-Event-ID` support. The client's only recovery
  option is to re-POST the original request (or, for a crashed generation, call
  `POST /runs/:id/replay` once the partial `Run` is persisted — see §2.4).
- **Mid-stream errors:** on failure, the server emits `event: error` /
  `data: {"type":"error","runId":"...","code":"PROVIDER_ERROR","message":"..."}`, immediately
  followed by `event: done`. The run is still persisted with `status: "error"` and
  `error: <message>`.

### 2.2 `SseEvent` variants (from `@ail/shared`)

| `type` | Fields (beyond `type`) | Example `data:` payload |
|---|---|---|
| `run_start` | `runId` | `{"type":"run_start","runId":"run_1"}` |
| `token` | `runId`, `token`, `index` | `{"type":"token","runId":"run_1","token":"Hello","index":0}` |
| `logprobs` | `runId`, `logprobs: LogProb[]` | `{"type":"logprobs","runId":"run_1","logprobs":[{"token":"Hello","logprob":-0.12,"topAlternatives":[{"token":"Hi","logprob":-1.4}]}]}` |
| `tool_call` | `runId`, `toolCall: ToolCall` | `{"type":"tool_call","runId":"run_1","toolCall":{"id":"call_1","name":"calculator","arguments":{"expr":"2+2"}}}` |
| `tool_result` | `runId`, `toolResult: ToolResult` | `{"type":"tool_result","runId":"run_1","toolResult":{"toolCallId":"call_1","content":"4","isError":false,"durationMs":3}}` |
| `agent_step` | `runId`, `step: AgentStep` | `{"type":"agent_step","runId":"agent_1","step":{"index":2,"type":"tool_call","content":"...","durationMs":120,"startedAt":"2026-01-01T00:00:00.000Z"}}` |
| `stage` | `runId`, `stage: string`, `data: unknown` | `{"type":"stage","runId":"run_1","stage":"retrieval.vector","data":{"candidates":5}}` |
| `progress` | `runId`, `percent` (0-100), `message?` | `{"type":"progress","runId":"eval_1","percent":40,"message":"case 4/10"}` |
| `run_complete` | `runId`, `run: Run` | `{"type":"run_complete","runId":"run_1","run":{ /* full Run */ }}` |
| `error` | `runId?`, `code`, `message` | `{"type":"error","runId":"run_1","code":"PROVIDER_ERROR","message":"Anthropic 529"}` |
| `done` | *(none)* | `{"type":"done"}` |

`runId` lets one HTTP response multiplex multiple logical runs — e.g. the sampling lab's `n`
parallel samples, or the model-comparison endpoint running 3 models at once, all share one SSE
connection and the client demultiplexes by `runId`. Every `runId` that gets a `run_start` MUST
eventually get exactly one terminal event for that id (`run_complete` or an `error` referencing
it) before the connection-level `done`.

`agent_step` additionally carries `AgentStepType: "approval_request"` when `limits` requires
human-in-the-loop. On that event, the stream **pauses** (no further `agent_step`/`token` events)
until the client calls `POST /agents/:id/approve` (§4.6), at which point the same open SSE
connection resumes. If no approval arrives within the agent's `timeoutMs`, the server emits
`agent_step` with `type: "error"`, then `run_complete` with `stopReason: "timeout"`, then `done`.

### 2.3 Every generation endpoint records a Run

Non-negotiable per CLAUDE.md: any route that calls an `LLMProvider` creates one `RunSchema` row
(service layer, via backend-core's `services/runs`), persisted to the `runs` table **before**
`run_complete` is emitted (so `run.id === runId` and the client can immediately
`GET /runs/:id` or open the Run Inspector). This applies to every module's generation routes —
sampling, technique demos, structured generation, RAG answer generation, agent steps that call
an LLM, eval-under-test calls, judge calls, and attack-bot responses. Judge calls additionally
set `EvalResult.judgeRunId` to the judge's own `Run.id` (so judge cost/latency is visible and
distinct from the call being evaluated).

### 2.4 Replay

`POST /runs/:id/replay` re-executes a persisted `Run`'s `input` + `params` (optionally with
`overrideParams` merged in) through the same provider/model, and streams a **new** run (new
`runId`) via the same SSE protocol. It does not mutate the original run.

---

## 3. Shared/platform routes (owner: `backend-core`)

All paths relative to `/api`.

| Method | Path | Request | Response | SSE | Notes |
|---|---|---|---|---|---|
| GET | `/health` | — | `{ ok: boolean, mode: string, providers: { configured: Record<ProviderId, boolean> }, db: { ok: boolean, driver?: string } }` | No | Already implemented in Wave 0 (`apps/api/src/app.ts`); shape may gain fields, not lose any. |
| GET | `/models` | query `?providerId=` (optional) | `{ models: ModelInfo[] }` | No | Source: `MODEL_CATALOG` plus a live probe of `OLLAMA_BASE_URL` (if reachable) merged in, deduped by `id`. |
| GET | `/providers` | — | `{ providers: { id: ProviderId; available: boolean; reason?: string }[] }` | No | `available` reflects whether the needed key/URL is configured, not a live health check. |
| GET | `/runs` | query `?moduleId=&feature=&providerId=&model=&traceId=&tags=&from=&to=&page=&pageSize=` | `Paginated<Run>` | No | `tags` is comma-separated, matches if run has ANY listed tag. |
| GET | `/runs/:id` | — | `Run` | No | 404 `NOT_FOUND` if missing. |
| DELETE | `/runs/:id` | — | `{ ok: true }` | No | Hard delete; also cascades eval_results rows referencing it? No — eval_results keep `runId` as a dangling reference and the eval UI shows "run deleted". |
| POST | `/runs/:id/replay` | `{ overrideParams?: GenerationParams }` | SSE (§2) | **Yes** | See §2.4. |
| GET | `/runs/compare` | query `?a=<runId>&b=<runId>` | `{ a: Run, b: Run, diff: { field: string; aValue: unknown; bValue: unknown }[] }` | No | `diff` is computed over `params`, `usage`, `cost`, `latencyMs`, `output.text` (by field path); used by `<CompareView>`. |
| POST | `/explain-run` | `ExplainRunRequest` (now includes optional `comparisonRunId: string`) | `ExplainRunResponse` | No | Synchronous; run(s) must already be `status: "complete"` or `"error"`, else 409 `CONFLICT`. When `comparisonRunId` is set, `explainRun()` produces an A/B comparison explanation of `runId` vs. `comparisonRunId` instead of a single-run explanation — this is what `<CompareView>`'s "Explain This Run" calls. See §7. |
| GET | `/traces` | query `?moduleId=&from=&to=&page=&pageSize=` | `Paginated<Trace>` | No | `moduleId` filters via the root span's `attributes.moduleId`. |
| GET | `/traces/:id` | — | `Trace` | No | 404 if missing. |

**Decision — glossary is NOT server-served.** Per CLAUDE.md, "Content (Learn text, glossary,
quizzes) lives in `apps/web/src/content/<module>/` as typed TS/MDX, not hardcoded in
components." The glossary is static, build-time content owned by `content-writer`
(`apps/web/src/content/glossary/`) and imported directly by the web app — there is no
`GET /glossary` API route. `<GlossaryTerm>` (frontend-shell) looks terms up from that module, not
over HTTP. If a future module needs glossary data server-side (e.g. for an LLM-judge prompt),
that agent reads the same TS module from `apps/api` via `@ail/shared`-style import — ask the
orchestrator if that import path needs to move into `packages/shared` instead.

---

## 4. Per-module routes

### Module 1 — LLM Fundamentals (owner: `llm-modules`, prefix `/fundamentals`)

| Method | Path | Request | Response | SSE | Notes |
|---|---|---|---|---|---|
| POST | `/fundamentals/tokenize` | `{ text: string; model: string }` | `{ tokens: { id: number; text: string; bytes?: number[] }[]; tokenCount: number }` | No | Route-local schema. Mock/Ollama models use a deterministic approximate tokenizer (documented as approximate in the UI); real provider models use their actual tokenizer if the SDK exposes one, else the same approximation with a disclosure. |
| POST | `/fundamentals/context-window` | `{ messages: Message[]; model: string; strategy: "truncate-oldest" \| "truncate-middle" \| "sliding-window" \| "summarize" }` | `{ fits: boolean; usedTokens: number; contextWindow: number; truncatedMessages: Message[]; strategyApplied: string; droppedCount: number }` | No | `"summarize"` internally makes one LLM call (via the selected provider) to compress dropped messages — this nested call still records its own `Run`. |
| POST | `/fundamentals/sample` | `{ providerId: ProviderId; model: string; messages: Message[]; params: GenerationParams; n?: number }` | SSE (§2) | **Yes** | `n` (default 1) parallel samples, each its own `runId`/`Run`; `logprobs` events emitted when `params.topK`/provider support allows. This is the temperature/top_p/top_k/seed/penalties lab. |
| POST | `/fundamentals/compare-models` | `{ models: { providerId: ProviderId; model: string }[]; messages: Message[]; params: GenerationParams }` | SSE (§2) | **Yes** | One `runId` per model, multiplexed; `run_complete` fires per model as it finishes (not necessarily in request order). |

### Module 2 — Prompt Engineering (owner: `llm-modules`, prefix `/prompting`)

| Method | Path | Request | Response | SSE | Notes |
|---|---|---|---|---|---|
| POST | `/prompting/render` | `{ template: string; variables: Record<string, string>; system?: string }` | `{ renderedPrompt: string; warnings: string[] }` | No | `warnings` flags unresolved `{{variables}}`, unescaped user-controlled delimiters, etc. — feeds the "injection-safe templating" teaching content. |
| POST | `/prompting/technique-demo` | `{ technique: "zero-shot" \| "few-shot" \| "cot" \| "self-consistency" \| "role" \| "xml-delimiters" \| "prefill" \| "chaining"; input: string; providerId: ProviderId; model: string; params: GenerationParams }` | SSE (§2) | **Yes** | Multi-step techniques (`self-consistency`, `chaining`) emit multiple `stage` events (one per sub-call) before the final `run_complete`; each sub-call is its own persisted `Run`, linked via `parentRunId`. |
| POST | `/prompting/coach` | `{ prompt: string }` | `{ score: number; issues: { label: string; detail: string }[]; improvedPrompt: string; diff: { op: "add" \| "remove" \| "same"; text: string }[] }` | No | Heuristic + one LLM call to produce `improvedPrompt`; that call is a persisted `Run` referenced via `metadata.runId` in the response. |
| GET | `/prompting/prompt-versions` | query `?name=&tag=&page=&pageSize=` | `Paginated<PromptVersion>` | No | |
| POST | `/prompting/prompt-versions` | `Omit<PromptVersion, "id" \| "createdAt">` | `201` `PromptVersion` | No | |
| GET | `/prompting/prompt-versions/:id` | — | `PromptVersion` | No | 404 if missing. |
| PUT | `/prompting/prompt-versions/:id` | `Partial<Omit<PromptVersion,"id">>` | `PromptVersion` | No | Creates a **new** version row with `parentVersionId` set to `:id` and `version = parent.version + 1`; does not mutate history, consistent with "versioned prompt" semantics used by Evals (M7). |
| DELETE | `/prompting/prompt-versions/:id` | — | `{ ok: true }` | No | 409 `CONFLICT` if referenced by an `EvalVariant` in a stored `EvalSuiteResult`. |
| POST | `/prompting/injection-check` | `{ template: string }` | `{ safe: boolean; findings: string[] }` | No | Lightweight, template-only check (unescaped interpolation, missing delimiters). The full attack/defense surface lives in M8 `/guardrails`; this route only teaches templating hygiene. |

### Module 3 — Structured Output & Tools (owner: `llm-modules`, prefix `/structured`)

| Method | Path | Request | Response | SSE | Notes |
|---|---|---|---|---|---|
| POST | `/structured/generate` | `{ mode: "json_mode" \| "schema_constrained" \| "forced_tool"; providerId: ProviderId; model: string; messages: Message[]; responseSchema?: unknown; params?: GenerationParams }` | SSE (§2) | **Yes** | `run_complete.run.output.parsedJson` is populated when parsing succeeds; `finishReason` reflects provider-reported stop reason. |
| POST | `/structured/validate` | `{ json: unknown; schema: unknown }` | `{ valid: boolean; errors: { path: string; message: string }[] }` | No | Pure function (unit-tested); no LLM call, no `Run`. |
| POST | `/structured/repair` | `{ invalidJson: string; schema: unknown; providerId: ProviderId; model: string; maxAttempts?: number }` | SSE (§2) | **Yes** | Emits one `stage` event per repair attempt (`{ stage: "repair.attempt", data: { attempt, valid, errors } }`), each attempt is its own `Run` with `parentRunId` chaining; `run_complete` carries the final (possibly still-invalid, after `maxAttempts`) result. |
| POST | `/structured/tool-call` | `{ providerId: ProviderId; model: string; messages: Message[]; tools: ToolDefinition[]; params?: GenerationParams }` | SSE (§2) | **Yes** | Emits `tool_call`/`tool_result` events for every round-trip; tools here are the sandboxed mock tools owned by `llm-modules` (distinct from M6's agent tool registry) — the full message trace (including tool turns) is in `run_complete.run.input.messages` as appended by the service layer. |

### Module 4 — Embeddings & Vector DB (owner: `retrieval-engineer`, prefixes `/embeddings`, `/vector`)

| Method | Path | Request | Response | SSE | Notes |
|---|---|---|---|---|---|
| POST | `/embeddings/embed` | `{ texts: string[]; providerId: ProviderId; model: string }` | `{ embeddings: number[][]; model: string; dim: number }` | No | Mock provider's `embed()` must be deterministic (hash-based) per CLAUDE.md so similarity/projection demos are reproducible without keys. |
| POST | `/embeddings/project-2d` | `{ embeddings: number[][]; method: "pca" \| "umap" }` | `{ points: { x: number; y: number }[] }` | No | Pure function, unit-testable; `"umap"` may fall back to a PCA approximation with a `note` field if a full UMAP implementation is out of scope — document the fallback in the UI, not silently. |
| POST | `/embeddings/similarity` | `{ a: number[]; b: number[]; metric: "cosine" \| "dot" \| "euclidean" }` | `{ score: number }` | No | |
| POST | `/embeddings/chunk-preview` | `{ text: string; config: ChunkConfig }` | `{ chunks: Chunk[] }` | No | No `documentId` persistence; pure preview for the chunking lab's boundary visualization. Real ingestion uses the M5 `/rag/documents/:id/chunk` route below (same underlying chunker service). |
| GET | `/vector/collections` | — | `{ collections: string[] }` | No | |
| POST | `/vector/collections` | `{ name: string; dim: number; opts?: CreateCollectionOptions }` | `201` `{ ok: true }` | No | 409 if name exists. |
| DELETE | `/vector/collections/:name` | — | `{ ok: true }` | No | |
| GET | `/vector/collections/:name/count` | — | `{ count: number }` | No | |
| POST | `/vector/collections/:name/upsert` | `{ points: VectorPoint[] }` | `{ upserted: number }` | No | |
| POST | `/vector/collections/:name/search` | `{ vector: number[] } & VectorSearchOptions` | `{ hits: VectorSearchHit[] }` | No | Exercises the `VectorStore.search` interface directly — used by the "index trade-offs" demo to compare Flat/HNSW/IVF latency/recall using `IndexConfig`. |
| POST | `/vector/collections/:name/delete` | `{ ids: string[] }` | `{ deleted: number }` | No | |
| POST | `/vector/hybrid-search` | `{ collection: string; query: string; topK: number; providerId: ProviderId; model: string; rrfK?: number }` | `{ results: RetrievalResult[]; debug: RetrievalDebug }` | No | BM25 + vector fused via Reciprocal Rank Fusion; `debug.stages` has one entry each for `"bm25"`, `"vector"`, `"fusion"`. |
| POST | `/vector/rerank` | `{ query: string; candidates: RetrievalResult[] }` | `{ before: RetrievalResult[]; after: RetrievalResult[] }` | No | `after[].source === "rerank"`; mock reranker must be deterministic. |

### Module 5 — RAG (owner: `retrieval-engineer`, prefix `/rag`)

| Method | Path | Request | Response | SSE | Notes |
|---|---|---|---|---|---|
| POST | `/rag/documents` | multipart form (`file`) **or** `{ name: string; mimeType: string; text: string }` | `201` `Document` | No | PDF parsing happens server-side for `application/pdf`; MD/TXT pass through. |
| GET | `/rag/documents` | query `?page=&pageSize=` | `Paginated<Document>` | No | |
| GET | `/rag/documents/:id` | — | `Document` | No | |
| DELETE | `/rag/documents/:id` | — | `{ ok: true }` | No | Also deletes its `chunks` rows and any vector-store points tagged with that `documentId`. |
| POST | `/rag/documents/:id/chunk` | `{ config: ChunkConfig }` | `{ chunks: Chunk[] }` | No | Persists `chunks` rows (replaces any prior chunking for this document). |
| POST | `/rag/documents/:id/embed` | `{ providerId: ProviderId; model: string }` | `{ chunks: Chunk[] }` | No | Populates `Chunk.embedding` on the persisted rows; requires `/chunk` to have run first (409 if no chunks exist). |
| POST | `/rag/documents/:id/index` | `{ collection: string }` | `{ ok: true; count: number }` | No | Upserts the document's embedded chunks into the named `VectorStore` collection (creates the collection if absent). |
| POST | `/rag/query` | `{ query: string; collection: string; strategy?: "basic" \| "query-rewrite" \| "hyde" \| "multi-query" \| "parent-doc" \| "compression" \| "agentic"; topK: number; providerId: ProviderId; model: string; params?: GenerationParams }` | SSE (§2) | **Yes** | Emits one `stage` event per pipeline step (`"rewrite"`, `"retrieve"`, `"compress"`, `"generate"`, strategy-dependent) each carrying a `RetrievalDebug`-shaped payload, then streams the generation `token`s, then `run_complete` with citations in `run.metadata.citations: { chunkId: string; documentId: string }[]` (top-level `Run.metadata`, NOT nested under `output` — `RunOutputSchema` has no `metadata` field) — **Decision:** citations live in `Run.metadata` rather than a new top-level `Run` field, since they're RAG-specific and `metadata: Record<string, unknown>` already exists for exactly this kind of module-specific extension. |
| POST | `/rag/failure-mode-demo` | `{ mode: "miss" \| "ignored" \| "lost-in-middle" \| "stale"; query: string; collection: string }` | `{ diagnosis: string; fix: string; retrievalDebug: RetrievalDebug; run: Run }` | No | Deliberately engineers the named failure (e.g. for `"stale"`, queries against a snapshot of the collection taken before a document update) for teaching purposes; non-streaming since it's a single demonstrative call, not an interactive generation. |

The "RAG vs long-context vs fine-tune" decision guide is static educational content — lives in
`apps/web/src/content/rag/` (content-writer), not an API route.

### Module 6 — Agents (+MCP) (owner: `agent-engineer`, prefixes `/agents`, `/mcp`)

| Method | Path | Request | Response | SSE | Notes |
|---|---|---|---|---|---|
| POST | `/agents/run` | `{ runtime: AgentRuntime; goal: string; toolAllowList: string[]; providerId: ProviderId; model: string; limits: AgentLimits; params?: GenerationParams }` | SSE (§2) | **Yes** | `runId` here is the `AgentRun.id`. Emits `agent_step` per step; LLM-calling steps also cause nested `Run`s (visible via `GET /runs?traceId=`). Terminates via `stopReason` (`final\|max_steps\|budget\|timeout\|loop_detected\|error\|awaiting_approval`). `AgentLimits` (from `@ail/shared`) carries all five tunable controls from CLAUDE.md: `maxSteps`, `budgetUsd`, `timeoutMs`, `loopDetection: LoopDetectionConfig` (enabled/window/similarityThreshold), and `requireApprovalForDangerousTools` + optional `approvalRequiredTools` (human-in-the-loop) — do not invent parallel ad hoc fields for these, the schema already covers them. |
| GET | `/agents/:id` | — | `AgentRun` | No | Full step history; 404 if missing. |
| POST | `/agents/:id/approve` | `{ stepIndex: number; approved: boolean; note?: string }` | `{ ok: true }` | No | Only valid while the agent's SSE stream (above) is paused on an `approval_request` step at that index; 409 `CONFLICT` otherwise. Resumes the paused stream — see §2.2. |
| GET | `/agents/tools` | — | `{ tools: ToolDefinition[] }` | No | The built-in registry: calculator, web-search mock, vector search (delegates to M4's `VectorStore`), isolated code sandbox, file reader (sandboxed to a fixtures dir), allow-listed HTTP fetcher. `dangerous: true` on sandbox/fetch/code tools. |
| GET | `/agents/:id/memory` | — | `{ shortTerm: unknown[]; longTerm: VectorSearchHit[]; summary: string }` | No | Inspects all three memory types for a completed/running agent run; `longTerm` is empty if the run's runtime doesn't use vector memory. |
| GET | `/mcp/servers` | — | `{ servers: { id: string; name: string; url?: string; status: "connected" \| "disconnected" }[] }` | No | In Mock mode this returns one or more in-process mock MCP servers so the section works with zero external setup. |
| GET | `/mcp/servers/:id/tools` | — | `{ tools: ToolDefinition[] }` | No | |
| POST | `/mcp/servers/:id/tools/:toolName/call` | `{ arguments: unknown }` | `ToolResult` | No | Direct tool invocation for the "expose MCP tools" explainer; agent runs that use MCP tools go through `/agents/run` instead and surface the calls as normal `tool_call`/`tool_result` events. |

### Module 7 — Evals (owner: `eval-security-engineer`, prefix `/evals`)

| Method | Path | Request | Response | SSE | Notes |
|---|---|---|---|---|---|
| GET | `/evals/datasets` | query `?page=&pageSize=` | `Paginated<Dataset>` | No | |
| POST | `/evals/datasets` | `{ name: string; description?: string; cases: EvalCase[] }` | `201` `Dataset` | No | |
| GET | `/evals/datasets/:id` | — | `Dataset` | No | |
| PUT | `/evals/datasets/:id` | `Partial<Omit<Dataset,"id">>` | `Dataset` | No | |
| DELETE | `/evals/datasets/:id` | — | `{ ok: true }` | No | 409 if referenced by a stored `EvalSuiteResult`. |
| POST | `/evals/datasets/:id/import` | `{ format: "json" \| "csv"; content: string }` | `{ imported: number; dataset: Dataset }` | No | CSV columns map to `EvalCase.input.*`/`expected` via a header row; documented in-app, not here. |
| GET | `/evals/datasets/:id/export` | query `?format=json\|csv` | file body (`application/json` or `text/csv`) | No | Only non-JSON response body shape in this entire contract; documented explicitly to avoid surprise. |
| POST | `/evals/run` | `{ datasetId: string; variants: EvalVariant[]; metricIds: MetricId[]; judgeRubric?: string }` | SSE (§2) | **Yes** | `progress` events report `percent`/`message` as `"case i/N, variant j/M"`; each case×variant LLM call and each `llm_judge`/`pairwise` judge call is its own persisted `Run`; final `run_complete.run` is a synthetic wrapper `Run` whose `output.parsedJson` is the full `EvalSuiteResult`, which is ALSO persisted separately and fetchable via the next route. |
| GET | `/evals/suite-results/:id` | — | `EvalSuiteResult` | No | |
| GET | `/evals/suite-results` | query `?datasetId=&page=&pageSize=` | `Paginated<EvalSuiteResult>` | No | |
| POST | `/evals/ci-check` | `{ suiteResultId: string; thresholds: Partial<Record<MetricId, number>> }` | `{ pass: boolean; failures: { metricId: MetricId; variantIndex: number; score: number; threshold: number }[] }` | No | Same endpoint backs both the in-app regression banner and the CI CLI (a thin script in `apps/api` that POSTs here and sets `process.exitCode = pass ? 0 : 1`). |
| POST | `/evals/judge-bias-demo` | discriminated on `demo`: `{ demo: "position" }` \| `{ demo: "verbosity"; conciseCorrect: string; verbosePadded: string }` \| `{ demo: "self_enhancement"; judgeProviderId: string; candidateProviderId: string }` | `"position"` → `{ forward: { winner: "A"\|"B"\|"tie"; rationale: string }; swapped: { winner; rationale }; biasDetected: boolean; explanation: string }`; `"verbosity"` → `{ naiveScore: number; lengthNormalizedScore: number; biasDetected: boolean; explanation: string }`; `"self_enhancement"` → `{ sameFamilyScore: number; thirdPartyJudgeScore: number; biasDetected: boolean; explanation: string }` | No | **Added post-Wave-2** (not in the original table — `eval-security-engineer` flagged the gap rather than deviating silently; see §8). Deterministic, offline, clearly-labeled-illustrative simulations of a biased judge (same honesty convention as the M10 attention-heatmap/quantization demos) — no live provider call, works identically in every mode including zero-key Mock, so "before" vs. "after" bias comparisons are reproducible and testable. Route-local schemas, not in `@ail/shared` (single-route DTOs per §0.2). |
| POST | `/evals/judge-calibration` | `{ cases: { caseId: string; humanScore: number; judgeScore: number }[] }` | `{ n: number; agreementRate: number; meanAbsoluteError: number; correlation: number }` | No | **Added post-Wave-2** (see §8). Pure function comparing real judge scores (e.g. already produced by `/evals/run`'s `llm_judge`/`pairwise` metrics) against human-labelled scores on the same cases — "validate the judge before trusting it" workflow. `correlation` is Pearson r, NaN-safe (0 when undefined, e.g. zero-variance inputs). Route-local schemas. |

### Module 8 — Guardrails & Security (owner: `eval-security-engineer`, prefix `/guardrails`)

| Method | Path | Request | Response | SSE | Notes |
|---|---|---|---|---|---|
| GET | `/guardrails/config` | — | `GuardrailConfig` | No | Server-wide current defaults (persisted as a single row/JSON blob, not per-user — no auth in v1). |
| PUT | `/guardrails/config` | `GuardrailConfig` | `GuardrailConfig` | No | Writes an `AuditLogEntry` (`action: "guardrail.config.update"`). |
| GET | `/guardrails/attacks` | — | `{ attacks: { id: string; name: string; category: "direct_injection" \| "indirect_injection" \| "jailbreak" \| "exfiltration" \| "tool_abuse" \| "prompt_leak"; owaspId: string; description: string }[] }` | No | Static catalog, served from the API (not frontend content) because the attack *payloads* must stay server-side only — CLAUDE.md requires the vulnerable bot and its attacks to be contained to the app, never exposed as reusable client-side strings that could be copy-pasted at a real provider by accident. |
| POST | `/guardrails/attack` | `{ attackId: string; configOverride?: Partial<GuardrailConfig>; providerId: ProviderId; model: string }` | SSE (§2) | **Yes** | Runs the attack against the deliberately-vulnerable demo bot (mock tools only, per CLAUDE.md). Emits `stage` events per guardrail layer evaluated, each carrying a `GuardrailReport`; `run_complete.run.metadata.guardrailReport: GuardrailReport` holds the final combined report. Every `GuardrailFinding` with `action !== "allow"` writes an `AuditLogEntry`. |
| GET | `/guardrails/owasp-map` | — | `{ mappings: { owaspId: string; title: string; attackIds: string[] }[] }` | No | |
| GET | `/guardrails/audit-log` | query `?resourceType=&from=&to=&page=&pageSize=` | `Paginated<AuditLogEntry>` | No | `AuditLogEntry` added to `@ail/shared` in this pass (§ report) — backs both M8's audit view and any M9 observability drill-down into guardrail events. |

### Module 9 — Production / Cost / Observability (owner: `platform-engineer`, prefix `/production`)

| Method | Path | Request | Response | SSE | Notes |
|---|---|---|---|---|---|
| GET | `/production/cost-summary` | query `?groupBy=module\|feature\|model\|providerId&from=&to=` | `{ rows: { key: string; totalCostUsd: number; totalTokens: number; runCount: number; avgLatencyMs: number }[] }` | No | Aggregates the `runs` table; the "tracing dashboard" otherwise reuses the shared `GET /traces` and `GET /runs` routes from §3 — no duplicate trace route here. |
| POST | `/production/cache-sim` | `{ cacheType: "prompt" \| "semantic" \| "response"; requests: { prompt: string }[]; assumedHitRate?: number }` | `{ withoutCache: { totalCostUsd: number; totalLatencyMs: number }; withCache: { totalCostUsd: number; totalLatencyMs: number }; hits: number; misses: number; savingsPct: number }` | No | "MEASURED savings" per CLAUDE.md: numbers come from actually running the requests through the Mock/selected provider twice (cold vs. simulated-cache), not a hand-wavy multiplier. |
| POST | `/production/routing-sim` | `{ requests: { prompt: string; complexity?: "low" \| "high" }[]; strategy: "cheapest" \| "complexity-based" \| "fallback-chain"; candidateModels: string[] }` | `{ assignments: { requestIndex: number; model: string; costUsd: number }[]; totalCostUsd: number; baselineCostUsd: number }` | No | `baselineCostUsd` = cost if every request had used the most expensive candidate model, for a visible savings comparison. |
| POST | `/production/batching-sim` | `{ requests: { prompt: string }[]; batchSize: number; providerId: ProviderId; model: string }` | `{ unbatched: { totalCostUsd: number; totalLatencyMs: number; requestCount: number }; batched: { totalCostUsd: number; totalLatencyMs: number; batchCount: number }; savingsPct: number }` | No | 3rd of CLAUDE.md's 4 mandated cost levers (prompt/semantic/response **cache**, model **routing**, **batching**, context **trimming**). Groups `requests` into `batchSize`-sized groups and actually issues one provider call per group vs. one call per request; `savingsPct` is MEASURED from those real simulated calls, not a hand-wavy multiplier — same pattern as `/cache-sim`. |
| POST | `/production/context-trim-sim` | `{ messages: Message[]; providerId: ProviderId; model: string; strategy: "truncate-oldest" \| "truncate-middle" \| "sliding-window" \| "summarize" }` | `{ untrimmed: { inputTokens: number; costUsd: number }; trimmed: { inputTokens: number; costUsd: number; strategyApplied: string }; savingsPct: number }` | No | 4th cost lever. MAY reuse the pure trimming function already built for M1's `POST /fundamentals/context-window` via a direct import of `llm-modules`'s exported service function (reading another module's exported function is fine; editing its files is not, per §5) — do not reimplement truncation logic from scratch if that export exists. `costUsd` computed via `estimateCostUsd` on the before/after token counts. |
| POST | `/production/reliability-sim` | `{ scenario: "timeout" \| "provider-down" \| "rate-limited" \| "duplicate-request" \| "queue-backpressure"; policy: { maxRetries: number; backoffMs: number; fallbackProviderId?: ProviderId; circuitBreakerThreshold?: number; idempotencyKey?: string; queueConcurrency?: number } }` | `{ attempts: { attempt: number; outcome: "success" \| "fail" \| "deduplicated" \| "queued"; latencyMs: number }[]; finalOutcome: "success" \| "failed"; totalLatencyMs: number; idempotencyKey?: string; queueDepthOverTime?: number[] }` | No | Pure simulation (injected synthetic failures/latency), no real provider calls — keeps the demo deterministic and free. `scenario: "duplicate-request"` demonstrates **idempotency**: the service replays the same `idempotencyKey` and the response echoes it with an attempt outcome of `"deduplicated"` instead of re-executing. `scenario: "queue-backpressure"` demonstrates **queues**: `queueConcurrency` caps in-flight work, excess requests get outcome `"queued"`, and `queueDepthOverTime` samples the queue size across the simulated run — covers all six reliability levers from CLAUDE.md (retry/backoff, timeouts, provider fallback, circuit breaker, idempotency, queues) in one route. |
| GET | `/production/latency-lab/presets` | — | `{ presets: { id: string; name: string; providerId: ProviderId; model: string; params: GenerationParams }[] }` | No | |
| POST | `/production/latency-lab/run` | `{ providerId: ProviderId; model: string; messages: Message[]; params?: GenerationParams }` | SSE (§2) | **Yes** | Thin wrapper over the standard generation stream, included under `/production` because the UI's framing is "measure TTFT / tokens-per-second", not "generate text" — reuses backend-core's generation service, does not reimplement it. |

Versioning/rollout playbook (pinning, shadow, canary, deprecation) is static educational content
in `apps/web/src/content/production/`, not an API route — there is no live traffic to shadow or
canary against in this app.

### Module 10 — Advanced Concepts (owner: `platform-engineer`, prefix `/advanced`)

| Method | Path | Request | Response | SSE | Notes |
|---|---|---|---|---|---|
| POST | `/advanced/attention-heatmap` | `{ text: string; providerId: ProviderId; model: string }` | `{ tokens: string[]; attention: number[][] }` | No | **Decision:** hosted-provider APIs (Anthropic/OpenAI) do not expose real attention weights; `attention` is a clearly-labeled illustrative approximation (e.g. positional-distance + token-similarity heuristic) for every `providerId` including `mock`. The response/UI must disclose this ("simulated, for intuition only") — never presented as the model's real internals. |
| POST | `/advanced/quantization-demo` | `{ model: string; precision: "fp16" \| "int8" \| "int4" }` | `{ approxSizeMb: number; approxLatencyFactor: number; qualityNotes: string }` | No | Illustrative figures only, clearly labeled; no invented authoritative benchmark numbers per CLAUDE.md — the UI must cite "order-of-magnitude illustration". |
| POST | `/advanced/synthetic-data` | `{ seedExamples: Record<string, unknown>[]; count: number; providerId: ProviderId; model: string }` | SSE (§2) | **Yes** | `stage` event per generated example (`{ stage: "synthetic.example", data: { index, example } }`); `run_complete.run.output.parsedJson` holds the full generated array. |
| POST | `/advanced/multimodal-demo` | `{ messages: Message[]; providerId: ProviderId; model: string; params?: GenerationParams }` | SSE (§2) | **Yes** | `messages` may include `image` content blocks (base64 or URL); thin wrapper over the standard generation stream, 422 if the chosen model's `ModelInfo.supportsVision` is false. |
| GET | `/advanced/reasoning-presets` | — | `{ presets: { id: string; name: string; providerId: ProviderId; model: string; thinkingBudget: number }[] }` | No | **Decision:** this route only returns preset data (id/name/model/budget). Actually *running* a preset is done by the frontend calling M1's existing `POST /fundamentals/sample` with `params.thinkingBudget` set from the chosen preset — there is no separate `/advanced/*` generation route for this. Rationale: thinking budget is just one more `GenerationParams` field, M1's sampling lab already streams against arbitrary params, and duplicating that plumbing under `/advanced` would be redundant generation code with no behavioral difference. `platform-engineer`'s frontend module composes the M1 streaming hook directly; this is an API *call*, not a file edit, so it does not violate §5 ownership. |

The pretrain→SFT→RLHF/DPO visual and the adaptation decision matrix (prompting vs RAG vs
fine-tune vs LoRA vs distill) are static educational content in `apps/web/src/content/advanced/`
— they are decision frameworks, not computations, so no API route.

### Module 11 — Glossary & Senior Checklist (owner: `platform-engineer`, prefix `/checklist`)

| Method | Path | Request | Response | SSE | Notes |
|---|---|---|---|---|---|
| GET | `/checklist/progress` | — | `{ completedItemIds: string[]; quizScores: Record<string, number> }` | No | Single-user app (no auth in v1) — one progress row in SQLite, not per-session. |
| POST | `/checklist/progress/complete-item` | `{ itemId: string; completed: boolean }` | `{ completedItemIds: string[]; quizScores: Record<string, number> }` | No | Checklist item *content* (id, category, question) lives in `apps/web/src/content/checklist/` (content-writer); the API only persists which ids are done. |
| POST | `/checklist/quiz/:quizId/submit` | `{ answers: Record<string, string> }` | `{ score: number; correct: Record<string, boolean>; explanations: Record<string, string> }` | No | Quiz questions/answer keys live in frontend content (content-writer, per its brief: "quizzes (content from content-writer)"); the route receives the answer key alongside the submission from the client **or** — simpler and preferred — the owning agent duplicates a minimal server-side copy of answer keys under `apps/api/src/services/checklist/` keyed by `quizId`, kept in sync with the content module by convention/tests. Pick one approach when implementing; either is acceptable since there is no scoring-integrity requirement (not a certification product). |

Design-review checklist content and system-design reference-architecture scenarios are static
content in `apps/web/src/content/checklist/` — no additional API route beyond progress/quiz
above.

---

## 5. File-ownership map

| Path glob | Owner |
|---|---|
| `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, `eslint.config.js`, `.env.example`, `docker-compose.yml`, `README.md` | `architect` |
| `packages/shared/**` | `architect` |
| `docs/contracts.md`, `docs/adr/**` | `architect` |
| `seed/**` | `architect` |
| `apps/api/src/{server,plugins,middleware,providers,services/runs,services/explain,db}/**` | `backend-core` |
| `apps/api/src/routes/index.ts` **(module route registry — seam file, see §9)** | `backend-core` |
| `apps/web/src/{app,components,layouts,hooks,stores,lib,styles}/**` (not module pages/content) | `frontend-shell` |
| `apps/web/src/app/router.tsx` **(module router — seam file, see §9)** | `frontend-shell` |
| `apps/web/src/content/**` | `content-writer` |
| `apps/api/src/{routes,services}/{fundamentals,prompting,structured}/**`, `apps/web/src/modules/{fundamentals,prompting,structured}/**` | `llm-modules` |
| `apps/api/src/{routes,services,stores}/{embeddings,vector,rag}/**`, `apps/web/src/modules/{embeddings,rag}/**` | `retrieval-engineer` |
| `apps/api/src/{routes,services}/{agents,mcp}/**`, `apps/web/src/modules/agents/**` | `agent-engineer` |
| `apps/api/src/{routes,services}/{evals,guardrails}/**`, `apps/web/src/modules/{evals,security}/**` | `eval-security-engineer` |
| `apps/api/src/{routes,services}/{production,advanced,checklist}/**`, `apps/web/src/modules/{production,advanced,checklist}/**` | `platform-engineer` |
| `**/*.test.ts`, `e2e/**`, `playwright.config.ts` (additive only) | `qa-engineer` |
| *(read-only, no files owned)* | `reviewer` |

**Escalation rule:** if your work requires touching a path you don't own, or changing a shape in
this document, STOP and report it to the orchestrator instead of editing it yourself. The
orchestrator updates `docs/contracts.md` (architect) and re-briefs affected agents. This is the
only way two agents' diffs never collide. The registry and router seam files above are the one
case already resolved for you — see §9: Wave 2 agents never touch them, by construction.

---

## 6. Frontend contract stub

`frontend-shell` (Wave 1) builds the shared UI shell and publishes its component API in
`docs/component-api.md`. Module agents (Wave 2) **compose** these components; they do not fork,
restyle, or reimplement them. Expect at least:

- `<ModuleShell moduleId learn playground experiments pitfalls />` — the three-pane layout
  (Learn | Playground | Run Inspector + "Why this happened") with the four tabs
  (Learn/Playground/Experiments/Pitfalls) from CLAUDE.md.
- `<RunInspector runId />` — renders a `Run` (params, usage, cost, latency, logprobs if present).
- `<CompareView runIdA runIdB />` — wraps `GET /runs/compare`, renders the diff.
- `<WhyThisHappened runId />` — wraps `POST /explain-run`, difficulty-aware.
- `<GlossaryTerm id>children</GlossaryTerm>` — tooltip sourced from `content-writer`'s glossary.
- A `DifficultyContext` / `useDifficulty()` hook for the Beginner/Intermediate/Senior toggle.
- `useSse<TEvent = SseEvent>(url, body)` — the shared streaming hook described in §2.1.
- `<ProviderModelSelect />` — reads `GET /models` + `GET /providers`.

Route pattern for every module page: `/m/:moduleId` (matching `ModuleIdSchema`), rendering
`<ModuleShell>` with that module's Learn/Playground/Experiments/Pitfalls content. Module agents
own the *content* passed into these tabs, not the shell markup itself.

---

## 7. Mock-mode guarantees

- `LLM_PROVIDER=mock` and zero API keys MUST make every route in §3 and §4 fully functional —
  this is graded in every wave's quality gate and by the `reviewer` agent.
- `MockProvider.generate`/`stream` must be **deterministic given `(model, messages, params.seed)`**
  and must visibly react to `params.temperature`/`topP`/`topK` (e.g. by varying which of a small
  deterministic candidate set is chosen, and by widening `logprobs.topAlternatives`), so the
  "change temperature, see token-probability shifts" acceptance criterion holds true even with
  zero keys.
- `MockProvider.embed` must be deterministic (e.g. a seeded hash-to-vector function) so chunking,
  similarity, projection, and RAG retrieval demos are reproducible without keys.
- `explainRun()` (backend-core) must derive `ExplainRunResponse.factors`/`summary` from the
  actual `Run`'s real `params`/`usage`/`output`/`logprobs` — including in Mock mode. It is a
  contract violation to return generic/templated text that doesn't reference the specific run's
  actual values (e.g. "temperature was 0.9, which is why the output diverged across the 3
  samples you ran" — not "temperature affects randomness").
- The vulnerable demo bot (M8) only ever calls mock tools with no real filesystem/network access,
  regardless of `LLM_PROVIDER` — attacks must be safe to run with real provider keys configured
  too.

---

## 8. Change log

| Date | Change | Requested by |
|---|---|---|
| 2026-10-04 | Initial version (Wave 0b). | orchestrator |
| 2026-10-04 | Added `AuditLogEntrySchema` to `@ail/shared` for M8/M9 audit trail. | architect (self, while authoring this doc) |
| 2026-10-04 | Added `POST /production/batching-sim` and `POST /production/context-trim-sim` (M9) so all 4 CLAUDE.md-mandated cost levers — cache, routing, batching, context trimming — have a designated route. | reviewer (Wave 0 audit) |
| 2026-10-04 | Extended `/production/reliability-sim`'s `scenario`/`policy`/response shape to cover idempotency (`"duplicate-request"`, `idempotencyKey`) and queues (`"queue-backpressure"`, `queueConcurrency`, `queueDepthOverTime`) per CLAUDE.md's full reliability list. | reviewer (Wave 0 audit) |
| 2026-10-04 | Added `LoopDetectionConfigSchema` and `requireApprovalForDangerousTools`/`approvalRequiredTools` fields to `AgentLimitsSchema` in `@ail/shared` so all 5 agent controls (max steps, budget, timeout, loop detection, human-in-the-loop approval) are expressible without `agent-engineer` needing to edit a schema it doesn't own. Updated the `/agents/run` row and added `agent.test.ts` coverage. | reviewer (Wave 0 audit) |
| 2026-10-04 | `/advanced/reasoning-presets`: resolved the deferred "pick one reuse path" note into a firm decision (reuse M1's `/fundamentals/sample`, no new generation route). | reviewer (Wave 0 audit) |
| 2026-10-05 | Added optional `comparisonRunId` to `ExplainRunRequestSchema` and the §3 `/explain-run` row. The comparison-factor path in `services/explain/factors.ts` was implemented and documented in `docs/backend-api.md` but unreachable through the API, making `<CompareView>`'s "Explain This Run" a dead feature. | reviewer (Wave 1 audit) |
| 2026-10-05 | §9.2 reworded to specify `import.meta.glob` as the web router mechanism instead of 11 literal `React.lazy(() => import(...))` calls. A literal dynamic import of a not-yet-existing path breaks the Vite build, defeating the graceful-degradation guarantee §9 exists to provide. Wave 2's obligation is unchanged (create `modules/<moduleId>/index.tsx` with a default export; never edit the router). | orchestrator (accepted frontend-shell's Wave 1 deviation) |
| 2026-10-05 | §4 M5 `/rag/query` row corrected: citations live at top-level `Run.metadata.citations`, not `run.output.metadata` (`RunOutputSchema` has no `metadata` field). Doc-only fix; shipped code and its integration test were already correct. | reviewer (Wave 2 audit) |
| 2026-10-05 | Added `POST /evals/judge-bias-demo` and `POST /evals/judge-calibration` to §4 M7 — implemented by `eval-security-engineer` to satisfy M7's judge-bias-education/calibration requirement, which had no route pre-listed; flagged rather than deviating silently. | eval-security-engineer (flagged), reviewer (Wave 2 audit) |
| 2026-10-05 | §9.1 disambiguated: plugin route paths are bare/relative to the registry's injected `{ prefix: "/api/<mount prefix>" }`, with a correct/wrong example pair. Previously ambiguous wording caused 5 of 13 route folders to double-prefix their paths (e.g. `/api/evals/evals/datasets`), failing 18 tests until `backend-core`/module agents fixed their own files. | reviewer (Wave 2 audit) |
| 2026-10-04 | Added §9 "Module registration conventions" (new seam files `apps/api/src/routes/index.ts` and `apps/web/src/app/router.tsx`, both added to §5 with owners `backend-core`/`frontend-shell`); fixed §5 API ownership gaps (`agent-engineer` now also owns `routes/services/mcp/**`, `platform-engineer` now also owns `routes/services/checklist/**`, matching routes that already existed in §4 but had no owning glob). | orchestrator (gap found during Wave 0 integration, not from the reviewer's list) |

---

## 9. Module registration conventions

This section exists so `apps/api/src/app.ts`/`routes/index.ts` and
`apps/web/src/app/router.tsx` are written **once**, in Wave 1, and never touched again in
Wave 2 — the two seams where all 5 Wave-2 agents' work gets wired in, without any of them
editing a file another agent owns.

### 9.1 API: route registry (owner: `backend-core`)

Each module-owning agent creates `apps/api/src/routes/<folder>/index.ts`, default-exporting a
Fastify plugin:

```ts
import type { FastifyPluginAsync } from "fastify";
const plugin: FastifyPluginAsync = async (app) => {
  app.get("/some-path", async (req, reply) => { /* ... */ });
};
export default plugin;
```

`backend-core` writes a **fixed registry** (in `apps/api/src/routes/index.ts`, registered once
from `app.ts`) listing every route folder and its mount prefix — this list is exhaustive and
never grows in Wave 2; it already accounts for every prefix in §4:

| folder | mount prefix | owner |
|---|---|---|
| `fundamentals` | `/api/fundamentals` | `llm-modules` |
| `prompting` | `/api/prompting` | `llm-modules` |
| `structured` | `/api/structured` | `llm-modules` |
| `embeddings` | `/api/embeddings` | `retrieval-engineer` |
| `vector` | `/api/vector` | `retrieval-engineer` |
| `rag` | `/api/rag` | `retrieval-engineer` |
| `agents` | `/api/agents` | `agent-engineer` |
| `mcp` | `/api/mcp` | `agent-engineer` |
| `evals` | `/api/evals` | `eval-security-engineer` |
| `guardrails` | `/api/guardrails` | `eval-security-engineer` |
| `production` | `/api/production` | `platform-engineer` |
| `advanced` | `/api/advanced` | `platform-engineer` |
| `checklist` | `/api/checklist` | `platform-engineer` |

(13 folders because M4 and M6 each split across two route prefixes; §3's shared platform routes
— `/health`, `/models`, `/runs`, `/traces`, `/explain-run`, `/providers` — are NOT in this list,
they stay directly in `backend-core`'s own `app.ts`/`routes/`.)

**Path convention (previously ambiguous — this caused a real incident: 5 of the 13 folders
double-prefixed their routes, e.g. `/api/evals/evals/datasets`, failing 18 tests until fixed).
The registry registers each plugin with `{ prefix: "/api/<mount prefix>" }` from the table
above. Fastify's `prefix` option means every path a plugin declares is RELATIVE to that
prefix and gets it prepended automatically — plugin route paths MUST therefore be bare,
never repeating the module's own prefix:**

```ts
// routes/agents/index.ts - CORRECT: paths are bare/relative.
const plugin: FastifyPluginAsync = async (app) => {
  app.post("/run", async (req, reply) => { /* ... */ });       // -> GET  /api/agents/run
  app.get("/:id", async (req) => { /* ... */ });                // -> GET  /api/agents/:id
};
export default plugin;
```

```ts
// routes/agents/index.ts - WRONG: re-adds the module's own prefix, double-mounts it.
const plugin: FastifyPluginAsync = async (app) => {
  app.post("/agents/run", async (req, reply) => { /* ... */ }); // -> GET  /api/agents/agents/run (!!) - 404 for every real client
};
export default plugin;
```

**Graceful degradation is required**: a folder in this list may not exist yet (Wave 2 in
progress, or only partially done). The registry loads each one via a **guarded dynamic import**
so a missing folder logs a warning and is skipped, instead of crashing the server:

```ts
for (const { folder, prefix } of MODULE_ROUTES) {
  try {
    const mod = await import(`./${folder}/index.js`);
    await app.register(mod.default, { prefix: `/api${prefix}` });
  } catch (err) {
    if (isModuleNotFoundError(err)) {
      app.log.warn(`[routes] ${folder} not implemented yet, skipping`);
    } else {
      throw err; // a real bug inside an existing module must still fail loudly
    }
  }
}
```

(`isModuleNotFoundError` only swallows "file doesn't exist" resolution failures — e.g. checking
`err.code === "ERR_MODULE_NOT_FOUND"` — never a real runtime error thrown *inside* a module that
does exist, which must still surface normally.) This lets Wave 1 boot with zero module folders
present, and lets Wave 2 land in any order without ever touching the registry file.

### 9.2 Web: lazy router (owner: `frontend-shell`)

Each module-owning agent creates `apps/web/src/modules/<moduleId>/index.tsx`, default-exporting
its page component, where `<moduleId>` is exactly one of the 11 `ModuleIdSchema` values:
`fundamentals, prompting, structured, embeddings, rag, agents, evals, security, production,
advanced, checklist`. (Note the one intentional naming divergence: M8's web module folder is
`security` — matching `ModuleId`, used in the UI/URL — while its API route folders are `evals`
and `guardrails`, matching §4's path prefixes. Same agent, different names, by design; do not
"fix" either side to match the other.)

`frontend-shell` writes `apps/web/src/app/router.tsx` once, mounting one route per `ModuleId` at
`/m/:moduleId`-style fixed paths (e.g. `/m/rag`). **As implemented**, module resolution uses
Vite's `import.meta.glob("/src/modules/*/index.tsx")` (eager: false) rather than 11 literal
`React.lazy(() => import("@/modules/<id>"))` calls — a literal dynamic import of a path that
doesn't exist yet fails the Vite build, which would defeat the graceful-degradation requirement
this section exists to guarantee, whereas `import.meta.glob` only picks up module folders that
actually exist on disk at build time. The router looks up the current `:moduleId` in the glob's
result map; a hit is wrapped in `React.lazy(...)` + `<Suspense>` with a loading-skeleton
fallback plus an error boundary (catches a throw from a module that exists but is currently
broken); a miss (folder not created yet) renders a "this module is coming in a later wave"
placeholder directly, with no import attempted. Verified both directions: zero module folders →
placeholder for all 11 ids; a folder added → it is picked up and lazy-loads with no router
change. This is what lets Wave 1 ship a fully navigable 11-module shell before any Wave-2 code
exists, and lets each Wave-2 agent land independently without the router needing a code change.

### 9.3 The rule

**Wave 2 agents create files only under their own `apps/api/src/routes/<folder>/**`,
`apps/api/src/services/<folder>/**`, and `apps/web/src/modules/<moduleId>/**` paths.** They never
edit `apps/api/src/routes/index.ts`, `apps/api/src/app.ts`, or `apps/web/src/app/router.tsx` —
those three files are complete as of the end of Wave 1. If a module needs the registry/router
mechanism itself to change (new mount convention, new fallback behavior), that is a contract
change: stop and ask the orchestrator, per §5's escalation rule.
