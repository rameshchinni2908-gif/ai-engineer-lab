import { z } from "zod";

/** Sampling / decoding parameters sent with a generation request. */
export const GenerationParamsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  stop: z.array(z.string()).optional(),
  seed: z.number().int().optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  /** Number of completions to sample. */
  n: z.number().int().positive().optional(),
  /** Token budget for extended/"thinking" reasoning, where supported. */
  thinkingBudget: z.number().int().nonnegative().optional(),
  jsonMode: z.boolean().optional(),
  /** JSON Schema (as unknown, validated at use-site) describing the desired response shape. */
  responseSchema: z.unknown().optional(),
  toolChoice: z.union([z.literal("auto"), z.literal("none"), z.literal("required"), z.string()])
    .optional(),
});
export type GenerationParams = z.infer<typeof GenerationParamsSchema>;

export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const CostBreakdownSchema = z.object({
  inputCostUsd: z.number().nonnegative(),
  outputCostUsd: z.number().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  currency: z.literal("USD").default("USD"),
});
export type CostBreakdown = z.infer<typeof CostBreakdownSchema>;

export const LogProbSchema = z.object({
  token: z.string(),
  logprob: z.number(),
  bytes: z.array(z.number()).optional(),
  topAlternatives: z.array(z.object({ token: z.string(), logprob: z.number() })),
});
export type LogProb = z.infer<typeof LogProbSchema>;
