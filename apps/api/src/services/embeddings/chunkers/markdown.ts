import type { ChunkConfig } from "@ail/shared";
import { countApproxTokens } from "../../runs/tokenizer.js";
import { packSegments, type PackedChunk } from "../pack.js";
import { splitRecursive } from "./recursive.js";

export const DEFAULT_MARKDOWN_SEPARATORS = ["\n## ", "\n### ", "\n#### ", "\n# ", "\n\n", "\n"];

const HEADER_LINE = /^(#{1,6})\s+(.*)$/;

/**
 * The most recent ATX header ("# "/"## "/...) at each level still "in scope"
 * at `offset` into `text` - e.g. `["Guide", "Installation"]` for a chunk that
 * falls under an H1 "Guide" and, more recently, an H2 "Installation". This is
 * what makes markdown chunking "aware" rather than a relabeled recursive
 * split: every chunk can be shown with its header breadcrumb in the UI.
 */
export function headerPathAt(text: string, offset: number): string[] {
  const headers: Record<number, string> = {};
  const lines = text.slice(0, offset).split("\n");
  for (const line of lines) {
    const m = HEADER_LINE.exec(line);
    if (!m) continue;
    const level = m[1]!.length;
    headers[level] = m[2]!.trim();
    for (let l = level + 1; l <= 6; l++) delete headers[l];
  }
  return Object.keys(headers)
    .map(Number)
    .sort((a, b) => a - b)
    .map((level) => headers[level]!);
}

export interface MarkdownPackedChunk extends PackedChunk {
  headerPath: string[];
}

/** Markdown-aware chunking: recursively splits on header/blank-line boundaries, then tags each chunk with its header breadcrumb. */
export function markdownChunk(text: string, config: ChunkConfig): MarkdownPackedChunk[] {
  const separators = config.separators ?? DEFAULT_MARKDOWN_SEPARATORS;
  const atoms = splitRecursive(text, 0, separators, config.chunkSize, countApproxTokens);
  const packed = packSegments(text, atoms, config.chunkSize, config.chunkOverlap, countApproxTokens);
  return packed.map((chunk) => ({ ...chunk, headerPath: headerPathAt(text, chunk.start) }));
}
