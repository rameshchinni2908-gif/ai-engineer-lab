import { z } from "zod";
import { ModuleIdSchema, ProviderIdSchema, IsoDateTimeSchema } from "./common.js";
import { MessageSchema } from "./message.js";
import { GenerationParamsSchema, TokenUsageSchema, CostBreakdownSchema, LogProbSchema } from "./generation.js";
import { ToolCallSchema } from "./tool.js";

export const RunStatusSchema = z.enum(["pending", "streaming", "complete", "error"]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const FinishReasonSchema = z.enum([
  "stop",
  "length",
  "tool_calls",
  "content_filter",
  "error",
]);
export type FinishReason = z.infer<typeof FinishReasonSchema>;

export const RunInputSchema = z.object({
  messages: z.array(MessageSchema),
  renderedPrompt: z.string().optional(),
});
export type RunInput = z.infer<typeof RunInputSchema>;

export const RunOutputSchema = z.object({
  text: z.string(),
  toolCalls: z.array(ToolCallSchema).optional(),
  parsedJson: z.unknown().optional(),
  finishReason: FinishReasonSchema.optional(),
});
export type RunOutput = z.infer<typeof RunOutputSchema>;

/**
 * A single recorded LLM invocation: every generation endpoint in the app
 * creates one of these so the Run Inspector / Compare / Explain-This-Run
 * features have real data to work with.
 */
export const RunSchema = z.object({
  id: z.string(),
  moduleId: ModuleIdSchema,
  /** Feature slug within the module, e.g. "sampling-lab", "rag-generate". */
  feature: z.string(),
  providerId: ProviderIdSchema,
  model: z.string(),
  params: GenerationParamsSchema,
  input: RunInputSchema,
  output: RunOutputSchema,
  usage: TokenUsageSchema,
  cost: CostBreakdownSchema,
  latencyMs: z.number().nonnegative(),
  ttftMs: z.number().nonnegative().optional(),
  tokensPerSecond: z.number().nonnegative().optional(),
  logprobs: z.array(LogProbSchema).optional(),
  status: RunStatusSchema,
  error: z.string().optional(),
  seed: z.number().int().optional(),
  createdAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.optional(),
  parentRunId: z.string().optional(),
  traceId: z.string().optional(),
  tags: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()),
});
export type Run = z.infer<typeof RunSchema>;
