import { randomUUID } from "node:crypto";
import type {
  CostBreakdown,
  GenerationParams,
  LogProb,
  Message,
  ModuleId,
  ProviderId,
  Run,
  ToolCall,
  ToolDefinition,
  TokenUsage,
} from "@ail/shared";
import { getProvider } from "../../providers/registry.js";
import type { SseWriter } from "../../plugins/sse.js";
import { insertRun, updateRun, getRun, type NewRun } from "./store.js";
import { providerError, notFoundError } from "../../middleware/errors.js";

function zeroUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}
function zeroCost(): CostBreakdown {
  return { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, currency: "USD" };
}

export interface GenerationRequestArgs {
  moduleId: ModuleId;
  feature: string;
  providerId: ProviderId;
  model: string;
  messages: Message[];
  params?: GenerationParams;
  system?: string;
  tools?: ToolDefinition[];
  parentRunId?: string;
  traceId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Non-streaming generation: calls the provider once, records a complete
 * `Run`, and returns it. For module endpoints that make a single internal
 * LLM call outside an SSE response (e.g. M2's `/prompting/coach`, M9's
 * sim routes) - still satisfies "every generation endpoint records a Run"
 * per contracts §2.3 without requiring a full SSE round-trip.
 */
export async function runGenerationOnce(args: GenerationRequestArgs): Promise<Run> {
  const provider = getProvider(args.providerId);
  let result;
  try {
    result = await provider.generate({
      model: args.model,
      messages: args.messages,
      params: args.params,
      system: args.system,
      tools: args.tools,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await insertRun(
      buildNewRun(args, {
        status: "error",
        error: message,
        usage: zeroUsage(),
        cost: zeroCost(),
        latencyMs: 0,
      }),
    );
    throw providerError(`${args.providerId} provider call failed: ${message}`, {
      providerId: args.providerId,
    });
  }

  const tokensPerSecond =
    result.latencyMs > 0 ? result.usage.outputTokens / (result.latencyMs / 1000) : undefined;

  return insertRun(
    buildNewRun(args, {
      status: "complete",
      output: { text: result.text, toolCalls: result.toolCalls, finishReason: result.finishReason },
      usage: result.usage,
      cost: result.cost,
      latencyMs: result.latencyMs,
      tokensPerSecond,
      logprobs: result.logprobs,
      completedAt: new Date().toISOString(),
    }),
  );
}

function buildNewRun(args: GenerationRequestArgs, overrides: Partial<NewRun>): NewRun {
  return {
    moduleId: args.moduleId,
    feature: args.feature,
    providerId: args.providerId,
    model: args.model,
    params: args.params ?? {},
    input: { messages: args.messages },
    output: { text: "" },
    usage: zeroUsage(),
    cost: zeroCost(),
    latencyMs: 0,
    status: "pending",
    seed: args.params?.seed,
    parentRunId: args.parentRunId,
    traceId: args.traceId,
    tags: args.tags ?? [],
    metadata: args.metadata ?? {},
    ...overrides,
  };
}

export interface StreamGenerationArgs extends GenerationRequestArgs {
  /** Pre-assigned run id (lets a caller multiplex several runIds over one SSE connection). */
  runId?: string;
  writer: SseWriter;
}

/**
 * Streaming generation: persists a `status: "streaming"` run BEFORE emitting
 * `run_start` (so `GET /runs/:id` works mid-stream), forwards every provider
 * stream event onto the shared SSE writer tagged with `runId`, then persists
 * the final `Run` (status `complete`/`error`) BEFORE emitting `run_complete`/
 * `error`. Does NOT emit the connection-level `done` event - callers may
 * multiplex several `streamGeneration` calls over one SSE response and must
 * send exactly one `done` themselves once every runId has terminated.
 */
export async function streamGeneration(args: StreamGenerationArgs): Promise<Run> {
  const { writer, runId: runIdArg, ...rest } = args;
  const runId = runIdArg ?? `run_${randomUUID()}`;
  const provider = getProvider(args.providerId);

  await insertRun(buildNewRun(rest, { id: runId, status: "streaming" }));
  writer.send({ type: "run_start", runId });

  const start = Date.now();
  let ttftMs: number | undefined;
  let text = "";
  let logprobs: LogProb[] = [];
  let toolCalls: ToolCall[] = [];
  let finishReason: Run["output"]["finishReason"];
  let usage: TokenUsage = zeroUsage();
  let cost: CostBreakdown = zeroCost();

  try {
    for await (const ev of provider.stream({
      model: args.model,
      messages: args.messages,
      params: args.params,
      system: args.system,
      tools: args.tools,
    })) {
      if (ev.type === "token") {
        if (ttftMs === undefined) ttftMs = Date.now() - start;
        text += ev.token;
        writer.send({ type: "token", runId, token: ev.token, index: ev.index });
      } else if (ev.type === "logprobs") {
        logprobs = [...logprobs, ...ev.logprobs];
        writer.send({ type: "logprobs", runId, logprobs: ev.logprobs });
      } else if (ev.type === "tool_call") {
        toolCalls = [...toolCalls, ev.toolCall];
        writer.send({ type: "tool_call", runId, toolCall: ev.toolCall });
      } else if (ev.type === "done") {
        finishReason = ev.result.finishReason;
        usage = ev.result.usage;
        cost = ev.result.cost;
        if (ev.result.text) text = ev.result.text;
        if (ev.result.logprobs) logprobs = ev.result.logprobs;
        if (ev.result.toolCalls) toolCalls = ev.result.toolCalls;
      }
    }

    const latencyMs = Date.now() - start;
    const tokensPerSecond = latencyMs > 0 ? usage.outputTokens / (latencyMs / 1000) : undefined;
    const completed = await updateRun(runId, {
      output: { text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, finishReason },
      usage,
      cost,
      latencyMs,
      ttftMs,
      tokensPerSecond,
      logprobs: logprobs.length > 0 ? logprobs : undefined,
      status: "complete",
      completedAt: new Date().toISOString(),
    });
    writer.send({ type: "run_complete", runId, run: completed });
    return completed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = await updateRun(runId, {
      status: "error",
      error: message,
      latencyMs: Date.now() - start,
      completedAt: new Date().toISOString(),
    });
    writer.send({ type: "error", runId, code: "PROVIDER_ERROR", message });
    return failed;
  }
}

export interface ReplayArgs {
  runId: string;
  overrideParams?: GenerationParams;
  writer: SseWriter;
}

/** `POST /runs/:id/replay`: re-runs a persisted run's input/params as a NEW run (new runId), per contracts §2.4. */
export async function replayRun(args: ReplayArgs): Promise<Run> {
  const original = await getRun(args.runId);
  if (!original) throw notFoundError(`Run ${args.runId} not found`);

  return streamGeneration({
    moduleId: original.moduleId,
    feature: original.feature,
    providerId: original.providerId,
    model: original.model,
    messages: original.input.messages,
    params: { ...original.params, ...args.overrideParams },
    parentRunId: original.id,
    tags: [...original.tags, "replay"],
    metadata: { ...original.metadata, replayOf: original.id },
    writer: args.writer,
  });
}
