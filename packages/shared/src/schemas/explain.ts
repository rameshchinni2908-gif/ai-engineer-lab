import { z } from "zod";
import { DifficultySchema } from "./common.js";

export const ExplainRunRequestSchema = z.object({
  runId: z.string(),
  difficulty: DifficultySchema.optional(),
});
export type ExplainRunRequest = z.infer<typeof ExplainRunRequestSchema>;

export const ExplainFactorSchema = z.object({
  label: z.string(),
  value: z.string(),
  impact: z.enum(["increased", "decreased", "neutral"]),
  detail: z.string(),
});
export type ExplainFactor = z.infer<typeof ExplainFactorSchema>;

/**
 * Output of `explainRun()`. MUST be derived from the actual Run's params/output/usage —
 * never generic boilerplate text, including in Mock provider mode.
 */
export const ExplainRunResponseSchema = z.object({
  runId: z.string(),
  summary: z.string(),
  factors: z.array(ExplainFactorSchema),
  whatToTryNext: z.array(z.string()),
  /** Same explanation reworded per difficulty level, keyed by Difficulty. */
  variants: z.record(DifficultySchema, z.string()).optional(),
});
export type ExplainRunResponse = z.infer<typeof ExplainRunResponseSchema>;
