import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";

export const DocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  text: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: IsoDateTimeSchema,
});
export type Document = z.infer<typeof DocumentSchema>;

export const ChunkSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  index: z.number().int().nonnegative(),
  text: z.string(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  tokenCount: z.number().int().nonnegative(),
  embedding: z.array(z.number()).optional(),
  metadata: z.record(z.string(), z.unknown()),
  parentChunkId: z.string().optional(),
});
export type Chunk = z.infer<typeof ChunkSchema>;

export const ChunkStrategySchema = z.enum(["fixed", "recursive", "sentence", "semantic", "markdown"]);
export type ChunkStrategy = z.infer<typeof ChunkStrategySchema>;

export const ChunkConfigSchema = z.object({
  strategy: ChunkStrategySchema,
  chunkSize: z.number().int().positive(),
  chunkOverlap: z.number().int().nonnegative(),
  separators: z.array(z.string()).optional(),
  semanticThreshold: z.number().min(0).max(1).optional(),
});
export type ChunkConfig = z.infer<typeof ChunkConfigSchema>;
