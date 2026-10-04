import { z } from "zod";
import { RunSchema } from "./run.js";
import { LogProbSchema } from "./generation.js";
import { ToolCallSchema, ToolResultSchema } from "./tool.js";
import { AgentStepSchema } from "./agent.js";

/**
 * Discriminated union of every SSE event type emitted by generation/agent/RAG/eval
 * streaming endpoints. Backend and frontend both import this so the wire format
 * never drifts. Each route documents in docs/contracts.md which subset it emits.
 */
export const SseEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run_start"), runId: z.string() }),
  z.object({ type: z.literal("token"), runId: z.string(), token: z.string(), index: z.number().int().nonnegative() }),
  z.object({ type: z.literal("logprobs"), runId: z.string(), logprobs: z.array(LogProbSchema) }),
  z.object({ type: z.literal("tool_call"), runId: z.string(), toolCall: ToolCallSchema }),
  z.object({ type: z.literal("tool_result"), runId: z.string(), toolResult: ToolResultSchema }),
  z.object({ type: z.literal("agent_step"), runId: z.string(), step: AgentStepSchema }),
  z.object({ type: z.literal("stage"), runId: z.string(), stage: z.string(), data: z.unknown() }),
  z.object({ type: z.literal("progress"), runId: z.string(), percent: z.number().min(0).max(100), message: z.string().optional() }),
  z.object({ type: z.literal("run_complete"), runId: z.string(), run: RunSchema }),
  z.object({ type: z.literal("error"), runId: z.string().optional(), code: z.string(), message: z.string() }),
  z.object({ type: z.literal("done") }),
]);
export type SseEvent = z.infer<typeof SseEventSchema>;

/** Narrow SseEvent to a specific `type` literal. */
export type SseEventOf<T extends SseEvent["type"]> = Extract<SseEvent, { type: T }>;
