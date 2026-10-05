/**
 * M3 tool-calling playground (`POST /structured/tool-call` - contracts.md
 * §4 M3). Unlike the other M3 routes, this one represents the ENTIRE
 * multi-round tool conversation as a SINGLE persisted `Run` whose
 * `input.messages` grows to include every tool_use/tool_result turn (per
 * contracts: "the full message trace ... is in run_complete.run.input.messages
 * as appended by the service layer") - so it calls the provider directly
 * (`getProvider`) round by round rather than using `streamGeneration`, which
 * would otherwise create one Run per round.
 */
import { randomUUID } from "node:crypto";
import type {
  CostBreakdown,
  GenerationParams,
  Message,
  ProviderId,
  Run,
  TokenUsage,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from "@ail/shared";
import { getProvider } from "../../providers/registry.js";
import { insertRun, updateRun } from "../runs/store.js";
import type { SseWriter } from "../../plugins/sse.js";
import { MOCK_TOOLS } from "./mock-tools.js";

// MockProvider deterministically wants to call a tool on every round as
// long as `tools` is non-empty (it has no notion of "I'm done now"), so the
// final round is always called WITHOUT tools to force a terminating textual
// answer - otherwise the Mock-mode loop would never naturally stop. This
// still allows up to MAX_ROUNDS-1 real tool-call rounds (e.g. a "3 parallel
// tool calls" demo spread sequentially across rounds 1-3, then a forced
// final summary round), which is documented in the Learn content as a
// known Mock-mode simplification.
const MAX_ROUNDS = 5;

function zeroUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}
function zeroCost(): CostBreakdown {
  return { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, currency: "USD" };
}
function sumUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}
function sumCost(a: CostBreakdown, b: CostBreakdown): CostBreakdown {
  return {
    inputCostUsd: a.inputCostUsd + b.inputCostUsd,
    outputCostUsd: a.outputCostUsd + b.outputCostUsd,
    totalCostUsd: a.totalCostUsd + b.totalCostUsd,
    currency: "USD",
  };
}

/** Executes one `ToolCall` against the sandboxed mock registry, never throwing - failures become `ToolResult.isError`. */
export function executeMockTool(call: ToolCall): ToolResult {
  const start = Date.now();
  const spec = MOCK_TOOLS[call.name];
  if (!spec) {
    return {
      toolCallId: call.id,
      content: `No mock implementation registered for tool "${call.name}".`,
      isError: true,
      durationMs: Date.now() - start,
    };
  }
  try {
    const args = (call.arguments ?? {}) as Record<string, unknown>;
    const content = spec.execute(args);
    return { toolCallId: call.id, content, isError: false, durationMs: Date.now() - start };
  } catch (err) {
    return {
      toolCallId: call.id,
      content: err instanceof Error ? err.message : String(err),
      isError: true,
      durationMs: Date.now() - start,
    };
  }
}

export interface RunToolCallArgs {
  providerId: ProviderId;
  model: string;
  messages: Message[];
  tools: ToolDefinition[];
  params?: GenerationParams;
  writer: SseWriter;
}

/** Runs the tool-call round trip to completion (or `MAX_ROUNDS`), as one growing `Run`. */
export async function runToolCallPlayground(args: RunToolCallArgs): Promise<void> {
  const provider = getProvider(args.providerId);
  const runId = `run_${randomUUID()}`;
  let messages: Message[] = [...args.messages];

  await insertRun({
    id: runId,
    moduleId: "structured",
    feature: "tool-call",
    providerId: args.providerId,
    model: args.model,
    params: args.params ?? {},
    input: { messages },
    output: { text: "" },
    usage: zeroUsage(),
    cost: zeroCost(),
    latencyMs: 0,
    status: "streaming",
    tags: ["tool-call"],
    metadata: {},
  });
  args.writer.send({ type: "run_start", runId });

  const start = Date.now();
  let usage = zeroUsage();
  let cost = zeroCost();
  let finishReason: Run["output"]["finishReason"];
  let finalText = "";

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const isFinalRound = round === MAX_ROUNDS - 1;
      const result = await provider.generate({
        model: args.model,
        messages,
        params: isFinalRound ? { ...args.params, toolChoice: "none" } : args.params,
        tools: isFinalRound ? undefined : args.tools,
      });
      usage = sumUsage(usage, result.usage);
      cost = sumCost(cost, result.cost);
      finishReason = result.finishReason;

      if (result.toolCalls && result.toolCalls.length > 0) {
        messages = [
          ...messages,
          {
            role: "assistant",
            content: result.toolCalls.map((tc) => ({ type: "tool_use" as const, id: tc.id, name: tc.name, input: tc.arguments })),
          },
        ];
        for (const call of result.toolCalls) {
          args.writer.send({ type: "tool_call", runId, toolCall: call });
          const toolResult = executeMockTool(call);
          args.writer.send({ type: "tool_result", runId, toolResult });
          messages = [
            ...messages,
            { role: "tool", content: toolResult.content, toolCallId: toolResult.toolCallId },
          ];
        }
        continue;
      }

      finalText = result.text;
      break;
    }

    const latencyMs = Date.now() - start;
    const completed = await updateRun(runId, {
      input: { messages },
      output: { text: finalText, finishReason },
      usage,
      cost,
      latencyMs,
      status: "complete",
      completedAt: new Date().toISOString(),
    });
    args.writer.send({ type: "run_complete", runId, run: completed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = await updateRun(runId, {
      input: { messages },
      status: "error",
      error: message,
      latencyMs: Date.now() - start,
      completedAt: new Date().toISOString(),
    });
    args.writer.send({ type: "error", runId, code: "PROVIDER_ERROR", message });
    void failed;
  }
}
