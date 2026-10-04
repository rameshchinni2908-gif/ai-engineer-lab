import { z } from "zod";

export const RetrievalSourceSchema = z.enum(["vector", "bm25", "hybrid", "rerank"]);
export type RetrievalSource = z.infer<typeof RetrievalSourceSchema>;

export const RetrievalResultSchema = z.object({
  chunkId: z.string(),
  text: z.string(),
  score: z.number(),
  rank: z.number().int().nonnegative(),
  source: RetrievalSourceSchema,
  documentId: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});
export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;

/** Per-stage candidate list, so the RAG UI can show what each stage produced. */
export const RetrievalStageSchema = z.object({
  stage: z.string(),
  candidates: z.array(RetrievalResultSchema),
  timingMs: z.number().nonnegative(),
});
export type RetrievalStage = z.infer<typeof RetrievalStageSchema>;

/** Full debug trace of a retrieval pipeline run: query rewriting, every stage, fusion, timings. */
export const RetrievalDebugSchema = z.object({
  query: z.string(),
  rewrittenQueries: z.array(z.string()),
  stages: z.array(RetrievalStageSchema),
  fusionDetails: z.record(z.string(), z.unknown()).optional(),
  totalTimingMs: z.number().nonnegative(),
});
export type RetrievalDebug = z.infer<typeof RetrievalDebugSchema>;
