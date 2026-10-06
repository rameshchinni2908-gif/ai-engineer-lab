# Backend service API (for Wave-2 module agents)

Owner: `backend-core`. This is the one-page surface Wave-2 agents call into -
import from `@ail/api`'s compiled service modules via **relative source
imports** (`../../../services/runs/index.js` etc. from your own
`apps/api/src/{routes,services}/<module>/**` files) - do not re-implement
run recording, SSE framing, tracing, tokenizing, or cost math.

## Providers (`src/providers/`)

```ts
import { getProvider, getDefaultProviderId, isProviderConfigured, PROVIDER_IDS } from "../../providers/registry.js";
getProvider(id: ProviderId): LLMProvider       // memoized singleton per provider
```
Call `getProvider(providerId).generate(...)`/`.stream(...)` directly ONLY if
you are not using `runGenerationOnce`/`streamGeneration` below (which already
call it for you and record the `Run`).

## Runs (`src/services/runs/`) - import from `services/runs/index.js`

```ts
// Non-streaming: one provider call, records a complete Run, returns it.
runGenerationOnce(args: GenerationRequestArgs): Promise<Run>

// Streaming: persists a "streaming" Run BEFORE run_start, forwards every
// provider event onto your SseWriter tagged with runId, persists the final
// Run BEFORE run_complete/error. Does NOT send `done` - YOU send exactly one
// `done` after all your runIds (there may be several, e.g. `n` samples or
// model-comparison) have terminated.
streamGeneration(args: StreamGenerationArgs /* GenerationRequestArgs & { runId?; writer } */): Promise<Run>

// GET /runs/:id/replay building block (platform route already wires this up).
replayRun(args: { runId; overrideParams?; writer }): Promise<Run>

// CRUD + listing/compare used by your own routes if you need run data directly.
insertRun(run: NewRun): Promise<Run>
updateRun(id, patch: Partial<Run>): Promise<Run>
getRun(id): Promise<Run | undefined>
deleteRun(id): Promise<boolean>
listRuns(filter): Promise<{ items: Run[]; total; page; pageSize; hasMore }>
compareRuns(aId, bId): Promise<{ a: Run; b: Run; diff: RunDiffEntry[] }>
```

`GenerationRequestArgs`: `{ moduleId, feature, providerId, model, messages, params?, system?, tools?, parentRunId?, traceId?, tags?, metadata? }`.

## Tracing (`src/services/runs/tracing.ts`, also exported from `services/runs/index.js`)

```ts
withSpan<T>(
  name: string,
  kind: SpanKind,            // "llm_call" | "tool_call" | "retrieval" | "embedding" | "guardrail" | "agent_step" | "internal"
  attributes: Record<string, unknown>,
  fn: (ctx: { traceId: string; spanId: string }) => Promise<T>,
  opts?: { traceId?: string; parentSpanId?: string },
): Promise<T>
getTrace(traceId): Promise<Trace | undefined>
listTraces(filter): Promise<{ items: Trace[]; total; page; pageSize; hasMore }>
```
Wrap every pipeline stage (RAG retrieval steps, agent steps, eval case runs,
guardrail layers) in `withSpan` so it shows up under `GET /traces/:id`. Pass
the SAME `traceId` through nested `withSpan`/`streamGeneration` calls (and
into `GenerationRequestArgs.traceId`) to build one tree per end-to-end run.

## Tokenizer (`src/services/runs/tokenizer.ts`)

```ts
approxTokenize(text: string): { id: number; text: string }[]
countApproxTokens(text: string): number
```
Use this for M1's tokenizer visualizer and anywhere else you need an
approximate token count - do not write a second tokenizer.

## SSE (`src/plugins/sse.ts`)

```ts
openSseStream(reply, requestId: string, opts?: { heartbeatMs?: number }): SseWriter
// SseWriter: { send(event: SseEvent): void; ping(): void; close(): void }
```
Open exactly once per request (it hijacks `reply`), `send()` every event,
send a `{ type: "done" }` yourself, then `close()`. See `routes/runs/index.ts`
(`POST /runs/:id/replay`) for the canonical usage pattern.

## Validation + errors

```ts
import { parseBody, parseQuery, parseParams } from "../../plugins/validation.js";
import { validationError, notFoundError, conflictError, unprocessableError, forbiddenError, providerError, providerTimeoutError, internalError } from "../../middleware/errors.js";
```
Throw the matching `*Error(message, details?)` helper from your route/service
- the central error handler turns it into the `ApiErrorSchema` envelope with
the correct HTTP status automatically. Never build that envelope yourself.

## Logging / PII redaction (`src/plugins/logger.ts`, `src/plugins/log-sanitize.ts`)

Policy is **deny-by-default**, not a hand-picked deny-list: every string
value logged anywhere is redacted to `"[redacted]"` UNLESS its key is on a
small allow-list of genuinely safe, non-user-content fields - `providerId`,
`model`, `moduleId`, `feature`, `strategy`, `runtime`, `metricId`, `status`,
`driver`, `mode`, `owaspId`, `severity`, `action`, `layer`, `category`,
`kind`, `toolChoice`, plus any key that is `id`/`ids` or ends in `Id`
(`runId`, `documentId`, `chunkId`, `parentRunId`, ... - opaque identifiers,
never enumerated one-by-one). Numbers and booleans are always safe (they
can't carry a prompt). This is enforced three ways so it can't be bypassed
by a new field name: a `req` serializer, a `body` serializer, and a
`hooks.logMethod` that sanitizes the merge object of **every** log call
site-wide (catches `log.info(req.body, "...")` spreads too, not just
`{ body: ... }`).

**Tradeoff - `code` is NOT on the safe list**, even though
`middleware/error-handler.ts` logs `{ code: err.code }` for debugging: M3's
sandbox/tool-call routes use the same key name for free-text source code,
and that ambiguity isn't worth the risk. Debug logs' `code` field will show
`"[redacted]"`; correlate a log line to its `ApiErrorSchema` response via
`requestId` instead (always safe, `Id`-suffixed). If you add a new route and
want one of its fields visible in logs, it must be a genuinely opaque,
non-free-text value - add it to `SAFE_STRING_KEYS` in `log-sanitize.ts`
(backend-core-owned; ask if you need a new safe field) rather than relying
on it being logged by accident.

## explainRun (`src/services/explain/`)

```ts
explainRun(args: { runId: string; difficulty?: Difficulty; comparisonRunId?: string }): Promise<ExplainRunResponse>
```
Already wired to `POST /explain-run`; module agents generally don't need to
call this directly, but it's available if a module wants an inline
explanation without a round-trip.
