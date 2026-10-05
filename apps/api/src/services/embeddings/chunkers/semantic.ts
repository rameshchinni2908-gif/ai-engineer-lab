import type { ChunkConfig } from "@ail/shared";
import { countApproxTokens } from "../../runs/tokenizer.js";
import { cosineSimilarity } from "../similarity.js";
import { splitSentences, type Segment } from "../segment.js";
import { packSegments, type PackedChunk } from "../pack.js";

const LOCAL_EMBED_DIM = 32;

/**
 * Lightweight deterministic hash-to-vector "embedding" used ONLY to decide
 * sentence-grouping boundaries for semantic chunking. This is NOT a real
 * embedding model and is intentionally local/self-contained (the
 * `/embeddings/chunk-preview` route takes no `providerId`/`model`, so
 * semantic chunking can't depend on a selected provider) - it is a fast,
 * deterministic proxy for "are these two sentences about the same thing",
 * good enough to demonstrate the strategy without a real model.
 */
export function localChunkEmbedding(text: string): number[] {
  const vec = new Array<number>(LOCAL_EMBED_DIM).fill(0);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const w of words) {
    let h = 0;
    for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
    const idx = h % LOCAL_EMBED_DIM;
    const sign = h % 2 === 0 ? 1 : -1;
    vec[idx] = (vec[idx] ?? 0) + sign;
  }
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function averageVectors(vectors: number[][]): number[] {
  const dim = vectors[0]?.length ?? 0;
  const out = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) out[i] = (out[i] ?? 0) + v[i]! / vectors.length;
  }
  return out;
}

/**
 * Semantic chunking: groups adjacent sentences while cosine similarity to the
 * running group centroid stays at/above `semanticThreshold` (default 0.5)
 * AND the group stays within `chunkSize` tokens; a similarity drop or size
 * cap starts a new group. Groups are then packed (for `chunkOverlap`) the
 * same way every other strategy is.
 */
export function semanticChunk(text: string, config: ChunkConfig): PackedChunk[] {
  const threshold = config.semanticThreshold ?? 0.5;
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const embeddings = sentences.map((s) => localChunkEmbedding(s.text));
  const groups: Segment[][] = [];
  let currentGroup: Segment[] = [sentences[0]!];
  let currentEmbeds: number[][] = [embeddings[0]!];

  for (let i = 1; i < sentences.length; i++) {
    const centroid = averageVectors(currentEmbeds);
    const sim = cosineSimilarity(embeddings[i]!, centroid);
    const prospectiveText = text.slice(currentGroup[0]!.start, sentences[i]!.end);
    const prospectiveTokens = countApproxTokens(prospectiveText);

    if (sim >= threshold && prospectiveTokens <= config.chunkSize) {
      currentGroup.push(sentences[i]!);
      currentEmbeds.push(embeddings[i]!);
    } else {
      groups.push(currentGroup);
      currentGroup = [sentences[i]!];
      currentEmbeds = [embeddings[i]!];
    }
  }
  groups.push(currentGroup);

  const groupSegments: Segment[] = groups.map((g) => {
    const start = g[0]!.start;
    const end = g[g.length - 1]!.end;
    return { start, end, text: text.slice(start, end) };
  });

  return packSegments(text, groupSegments, config.chunkSize, config.chunkOverlap);
}
