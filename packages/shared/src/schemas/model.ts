import { z } from "zod";
import { ProviderIdSchema } from "./common.js";

/** Static metadata describing a specific LLM the app can call. */
export const ModelInfoSchema = z.object({
  id: z.string(),
  providerId: ProviderIdSchema,
  displayName: z.string(),
  contextWindow: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  /** USD per million input tokens. Illustrative unless noted otherwise. */
  inputCostPerMTok: z.number().nonnegative(),
  /** USD per million output tokens. Illustrative unless noted otherwise. */
  outputCostPerMTok: z.number().nonnegative(),
  supportsTools: z.boolean(),
  supportsLogprobs: z.boolean(),
  supportsStreaming: z.boolean(),
  supportsVision: z.boolean(),
  supportsThinking: z.boolean(),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
