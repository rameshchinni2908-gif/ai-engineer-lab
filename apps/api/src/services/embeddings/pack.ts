import { countApproxTokens } from "../runs/tokenizer.js";
import type { Segment } from "./segment.js";

export interface PackedChunk {
  start: number;
  end: number;
  text: string;
}

/**
 * Greedily packs contiguous `segments` into token-budgeted windows of up to
 * `chunkSize` approximate tokens, with `chunkOverlap` tokens' worth of
 * trailing segments carried into the start of the next window - the shared
 * sliding-window mechanics behind all five chunking strategies (each
 * strategy just chooses a different `segments` granularity: words, recursive
 * separator pieces, sentences, semantic groups, or markdown blocks).
 *
 * Guarantees forward progress (no infinite loop) even when a single segment
 * alone exceeds `chunkSize` (the "huge token" edge case - it becomes its own
 * oversized chunk rather than being silently dropped or looping forever) and
 * even when `chunkOverlap >= chunkSize` (overlap degrades to the minimum
 * 1-segment step rather than refusing to advance).
 */
export function packSegments(
  text: string,
  segments: Segment[],
  chunkSize: number,
  chunkOverlap: number,
  countTokens: (s: string) => number = countApproxTokens,
): PackedChunk[] {
  const chunks: PackedChunk[] = [];
  if (segments.length === 0) return chunks;

  let i = 0;
  while (i < segments.length) {
    let curTokens = 0;
    let endIdx = i;
    let j = i;
    while (j < segments.length) {
      const segTokens = countTokens(segments[j]!.text);
      if (curTokens + segTokens > chunkSize && endIdx > i) break;
      curTokens += segTokens;
      endIdx = j + 1;
      j++;
      if (curTokens >= chunkSize) break;
    }

    const start = segments[i]!.start;
    const end = segments[endIdx - 1]!.end;
    chunks.push({ start, end, text: text.slice(start, end) });

    if (endIdx >= segments.length) break;

    let backTokens = 0;
    let newI = endIdx;
    while (newI > i + 1 && backTokens < chunkOverlap) {
      newI--;
      backTokens += countTokens(segments[newI]!.text);
    }
    i = newI > i ? newI : endIdx;
  }

  return chunks;
}
