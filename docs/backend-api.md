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

## explainRun (`src/services/explain/`)

```ts
explainRun(args: { runId: string; difficulty?: Difficulty; comparisonRunId?: string }): Promise<ExplainRunResponse>
```
Already wired to `POST /explain-run`; module agents generally don't need to
call this directly, but it's available if a module wants an inline
explanation without a round-trip.
