import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";
import { TokenUsageSchema, CostBreakdownSchema } from "./generation.js";
import { ToolCallSchema, ToolResultSchema } from "./tool.js";

export const AgentStepTypeSchema = z.enum([
  "thought",
  "tool_call",
  "tool_result",
  "plan",
  "reflection",
  "delegate",
  "final",
  "error",
  "approval_request",
]);
export type AgentStepType = z.infer<typeof AgentStepTypeSchema>;

export const AgentStepSchema = z.object({
  index: z.number().int().nonnegative(),
  type: AgentStepTypeSchema,
  content: z.string(),
  toolCall: ToolCallSchema.optional(),
  toolResult: ToolResultSchema.optional(),
  usage: TokenUsageSchema.optional(),
  cost: CostBreakdownSchema.optional(),
  durationMs: z.number().nonnegative(),
  startedAt: IsoDateTimeSchema,
  memoryWrites: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type AgentStep = z.infer<typeof AgentStepSchema>;

export const AgentRuntimeSchema = z.enum([
  "react",
  "plan_execute",
  "reflection",
  "supervisor_worker",
]);
export type AgentRuntime = z.infer<typeof AgentRuntimeSchema>;

export const AgentStatusSchema = z.enum(["running", "complete", "error", "awaiting_approval"]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentStopReasonSchema = z.enum([
  "final",
  "max_steps",
  "budget",
  "timeout",
  "loop_detected",
  "error",
  "awaiting_approval",
]);
export type AgentStopReason = z.infer<typeof AgentStopReasonSchema>;

/** Input knobs for loop detection - a sibling of `AgentStopReason: "loop_detected"`, which is the *outcome*. */
export const LoopDetectionConfigSchema = z.object({
  enabled: z.boolean(),
  /** How many trailing steps to compare when checking for a repeating pattern. */
  window: z.number().int().positive(),
  /** 0..1 similarity above which two steps are considered "the same" for loop purposes. */
  similarityThreshold: z.number().min(0).max(1),
});
export type LoopDetectionConfig = z.infer<typeof LoopDetectionConfigSchema>;

/**
 * The five tunable agent controls from CLAUDE.md / agent-engineer's brief:
 * max steps, budget cap, timeout, loop detection, human-in-the-loop approval.
 * `maxSteps`/`budgetUsd`/`timeoutMs` bound the run; `loopDetection` and the
 * approval fields configure the other two *inputs* (their corresponding
 * *outcomes* are `AgentStopReason: "loop_detected" | "awaiting_approval"`
 * and `AgentStepType: "approval_request"`).
 */
export const AgentLimitsSchema = z.object({
  maxSteps: z.number().int().positive(),
  budgetUsd: z.number().nonnegative(),
  timeoutMs: z.number().int().positive(),
  loopDetection: LoopDetectionConfigSchema,
  /** If true, any tool call to a tool flagged `dangerous: true` (or listed in `approvalRequiredTools`) emits an `approval_request` step and pauses the run. */
  requireApprovalForDangerousTools: z.boolean(),
  /** Explicit opt-in list of additional tool names that always require approval, regardless of their `dangerous` flag. */
  approvalRequiredTools: z.array(z.string()).optional(),
});
export type AgentLimits = z.infer<typeof AgentLimitsSchema>;

export const AgentRunSchema = z.object({
  id: z.string(),
  runtime: AgentRuntimeSchema,
  goal: z.string(),
  steps: z.array(AgentStepSchema),
  status: AgentStatusSchema,
  stopReason: AgentStopReasonSchema.optional(),
  limits: AgentLimitsSchema,
  totals: z.object({
    usage: TokenUsageSchema,
    cost: CostBreakdownSchema,
    durationMs: z.number().nonnegative(),
  }),
  traceId: z.string().optional(),
  createdAt: IsoDateTimeSchema,
});
export type AgentRun = z.infer<typeof AgentRunSchema>;
