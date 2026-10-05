import type { ChunkConfig } from "@ail/shared";
import { countApproxTokens } from "../../runs/tokenizer.js";
import { packSegments, type PackedChunk } from "../pack.js";
import type { Segment } from "../segment.js";

export const DEFAULT_RECURSIVE_SEPARATORS = ["\n\n", "\n", ". ", " "];

const CHARS_PER_TOKEN_FALLBACK = 4;

/** Last-resort splitter when no configured separator ever gets a piece under budget: fixed-size character windows. */
function splitByCharacters(text: string, offset: number, chunkSize: number): Segment[] {
  const windowChars = Math.max(1, chunkSize * CHARS_PER_TOKEN_FALLBACK);
  const segments: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + windowChars);
    segments.push({ start: offset + i, end: offset + end, text: text.slice(i, end) });
    i = end;
  }
  return segments;
}

/**
 * Recursively splits `text` on the first separator (from `separators`, in
 * priority order) that actually appears and keeps any resulting piece still
 * over `chunkSize` tokens for further splitting on the REMAINING separators.
 * Falls back to fixed-size character windows once separators are exhausted
 * (guarantees termination on a single huge unsplittable token/run).
 */
export function splitRecursive(
  text: string,
  offset: number,
  separators: string[],
  chunkSize: number,
  countTokens: (s: string) => number,
): Segment[] {
  if (text.length === 0) return [];
  if (countTokens(text) <= chunkSize) {
    return [{ start: offset, end: offset + text.length, text }];
  }
  if (separators.length === 0) {
    return splitByCharacters(text, offset, chunkSize);
  }

  const [sep, ...rest] = separators as [string, ...string[]];
  if (!text.includes(sep)) {
    return splitRecursive(text, offset, rest, chunkSize, countTokens);
  }

  const parts: string[] = [];
  let cursor = 0;
  for (;;) {
    const idx = text.indexOf(sep, cursor);
    if (idx === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    parts.push(text.slice(cursor, idx + sep.length));
    cursor = idx + sep.length;
  }

  const results: Segment[] = [];
  let localOffset = offset;
  for (const part of parts) {
    if (part.length === 0) continue;
    if (countTokens(part) > chunkSize) {
      results.push(...splitRecursive(part, localOffset, rest, chunkSize, countTokens));
    } else {
      results.push({ start: localOffset, end: localOffset + part.length, text: part });
    }
    localOffset += part.length;
  }
  return results;
}

/** Recursive chunking: try separators in priority order, falling back to character windows, then pack to `chunkSize`/`chunkOverlap`. */
export function recursiveChunk(text: string, config: ChunkConfig): PackedChunk[] {
  const separators = config.separators ?? DEFAULT_RECURSIVE_SEPARATORS;
  const atoms = splitRecursive(text, 0, separators, config.chunkSize, countApproxTokens);
  return packSegments(text, atoms, config.chunkSize, config.chunkOverlap, countApproxTokens);
}
