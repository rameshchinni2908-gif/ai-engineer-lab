import { randomUUID } from "node:crypto";
import type { Chunk, ChunkConfig } from "@ail/shared";
import { countApproxTokens } from "../../runs/tokenizer.js";
import { fixedChunk } from "./fixed.js";
import { recursiveChunk, splitRecursive, DEFAULT_RECURSIVE_SEPARATORS } from "./recursive.js";
import { sentenceChunk } from "./sentence.js";
import { semanticChunk, localChunkEmbedding } from "./semantic.js";
import { markdownChunk, DEFAULT_MARKDOWN_SEPARATORS, headerPathAt } from "./markdown.js";

export { fixedChunk, recursiveChunk, sentenceChunk, semanticChunk, markdownChunk };
export { splitRecursive, DEFAULT_RECURSIVE_SEPARATORS, DEFAULT_MARKDOWN_SEPARATORS, headerPathAt, localChunkEmbedding };

export interface ChunkSpan {
  start: number;
  end: number;
  text: string;
  metadata?: Record<string, unknown>;
}

/** Validates a `ChunkConfig` for internal consistency, throwing a plain `Error` the route layer maps to 422 `UNPROCESSABLE`. */
export function assertValidChunkConfig(config: ChunkConfig): void {
  if (config.chunkOverlap >= config.chunkSize) {
    throw new Error(
      `chunkOverlap (${config.chunkOverlap}) must be smaller than chunkSize (${config.chunkSize})`,
    );
  }
}

/** Dispatches to the configured strategy and returns raw character-offset spans (no `Chunk` ids yet). */
export function splitIntoSpans(text: string, config: ChunkConfig): ChunkSpan[] {
  assertValidChunkConfig(config);
  switch (config.strategy) {
    case "fixed":
      return fixedChunk(text, config);
    case "recursive":
      return recursiveChunk(text, config);
    case "sentence":
      return sentenceChunk(text, config);
    case "semantic":
      return semanticChunk(text, config);
    case "markdown":
      return markdownChunk(text, config).map((c) => ({
        start: c.start,
        end: c.end,
        text: c.text,
        metadata: { headerPath: c.headerPath },
      }));
  }
}

/** Assembles full `Chunk` records (per `ChunkSchema`: id/documentId/index/tokenCount/...) from raw spans. */
export function spansToChunks(documentId: string, spans: ChunkSpan[]): Chunk[] {
  return spans.map((span, index) => ({
    id: randomUUID(),
    documentId,
    index,
    text: span.text,
    startOffset: span.start,
    endOffset: span.end,
    tokenCount: countApproxTokens(span.text),
    metadata: span.metadata ?? {},
  }));
}

/** One-shot: `text` + `ChunkConfig` -> final `Chunk[]` for a given `documentId` ("preview" for the chunk-preview route). */
export function chunkText(documentId: string, text: string, config: ChunkConfig): Chunk[] {
  return spansToChunks(documentId, splitIntoSpans(text, config));
}
