import type { ChunkConfig } from "@ail/shared";
import { splitSentences } from "../segment.js";
import { packSegments, type PackedChunk } from "../pack.js";

/** Sentence-aware chunking: packs whole sentences (never splitting mid-sentence) up to `chunkSize` tokens. */
export function sentenceChunk(text: string, config: ChunkConfig): PackedChunk[] {
  const sentences = splitSentences(text);
  return packSegments(text, sentences, config.chunkSize, config.chunkOverlap);
}
