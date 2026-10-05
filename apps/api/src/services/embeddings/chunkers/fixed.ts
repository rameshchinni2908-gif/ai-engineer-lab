import type { ChunkConfig } from "@ail/shared";
import { splitWords } from "../segment.js";
import { packSegments, type PackedChunk } from "../pack.js";

/** Fixed-size chunking: sliding windows of `chunkSize` approximate tokens over word boundaries. */
export function fixedChunk(text: string, config: ChunkConfig): PackedChunk[] {
  const words = splitWords(text);
  return packSegments(text, words, config.chunkSize, config.chunkOverlap);
}
