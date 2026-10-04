import { z } from "zod";
import { IsoDateTimeSchema, ProviderIdSchema } from "./common.js";

export const EvalCaseSchema = z.object({
  id: z.string(),
  input: z.record(z.string(), z.unknown()),
  expected: z.unknown().optional(),
  tags: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export const DatasetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  cases: z.array(EvalCaseSchema),
});
export type Dataset = z.infer<typeof DatasetSchema>;

export const MetricIdSchema = z.enum([
  "exact_match",
  "regex",
  "json_schema_valid",
  "semantic_similarity",
  "llm_judge",
  "pairwise",
  "rag_faithfulness",
  "rag_answer_relevance",
  "rag_context_precision",
  "rag_context_recall",
  "latency",
  "cost",
]);
export type MetricId = z.infer<typeof MetricIdSchema>;

export const EvalResultSchema = z.object({
  id: z.string(),
  datasetId: z.string(),
  caseId: z.string(),
  runId: z.string(),
  metricId: MetricIdSchema,
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  rationale: z.string().optional(),
  judgeRunId: z.string().optional(),
  createdAt: IsoDateTimeSchema,
});
export type EvalResult = z.infer<typeof EvalResultSchema>;

export const EvalVariantSchema = z.object({
  promptVersionId: z.string(),
  providerId: ProviderIdSchema,
  model: z.string(),
});
export type EvalVariant = z.infer<typeof EvalVariantSchema>;

/** Aggregated result of running a dataset across multiple prompt/model variants. */
export const EvalSuiteResultSchema = z.object({
  id: z.string(),
  datasetId: z.string(),
  variants: z.array(EvalVariantSchema),
  rows: z.array(EvalResultSchema),
  /** aggregates[variantIndex][metricId] = mean score */
  aggregates: z.array(z.record(z.string(), z.number())),
  regressions: z.array(
    z.object({
      metricId: MetricIdSchema,
      fromVariantIndex: z.number().int().nonnegative(),
      toVariantIndex: z.number().int().nonnegative(),
      delta: z.number(),
    }),
  ),
  totalCost: z.number().nonnegative(),
  totalLatencyMs: z.number().nonnegative(),
  createdAt: IsoDateTimeSchema,
});
export type EvalSuiteResult = z.infer<typeof EvalSuiteResultSchema>;
