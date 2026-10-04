import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";
import { TokenUsageSchema, CostBreakdownSchema } from "./generation.js";

export const SpanKindSchema = z.enum([
  "llm_call",
  "tool_call",
  "retrieval",
  "embedding",
  "guardrail",
  "agent_step",
  "internal",
]);
export type SpanKind = z.infer<typeof SpanKindSchema>;

export const SpanStatusSchema = z.enum(["ok", "error"]);
export type SpanStatus = z.infer<typeof SpanStatusSchema>;

export const SpanEventSchema = z.object({
  name: z.string(),
  timestamp: IsoDateTimeSchema,
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type SpanEvent = z.infer<typeof SpanEventSchema>;

/** OTel-shaped span. One span per LLM call / tool call / retrieval stage / etc. */
export const SpanSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  kind: SpanKindSchema,
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema.optional(),
  durationMs: z.number().nonnegative().optional(),
  attributes: z.record(z.string(), z.unknown()),
  events: z.array(SpanEventSchema),
  status: SpanStatusSchema,
});
export type Span = z.infer<typeof SpanSchema>;

/** A complete trace tree: all spans for one end-to-end operation (e.g. one agent run or RAG query). */
export const TraceSchema = z.object({
  id: z.string(),
  rootSpanId: z.string(),
  spans: z.array(SpanSchema),
  totals: z.object({
    usage: TokenUsageSchema,
    cost: CostBreakdownSchema,
    durationMs: z.number().nonnegative(),
  }),
});
export type Trace = z.infer<typeof TraceSchema>;
