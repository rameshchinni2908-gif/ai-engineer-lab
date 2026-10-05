import type { RetrievalResult } from "@ail/shared";

/**
 * Deterministic mock cross-encoder reranker: a real cross-encoder jointly
 * encodes (query, candidate) pairs for a much more accurate - and much more
 * expensive per-pair - relevance score than a cheap retriever's similarity
 * score. This mock reproduces the SHAPE of that behaviour (query-aware,
 * pairwise, deterministic) without a model: a hashed pairwise "base" score
 * plus an explicit lexical-overlap boost, so candidates that actually share
 * query vocabulary are rewarded on top of the hash noise - good enough to
 * teach the two-stage "broad retrieve, then precise rerank" pattern.
 */

const TOKEN_RE = /[a-z0-9]+/g;

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().match(TOKEN_RE) ?? []);
}

function hashPair(a: string, b: string): number {
  const combined = `${a}::${b}`;
  let h = 0;
  for (let i = 0; i < combined.length; i++) {
    h = (h * 31 + combined.charCodeAt(i)) >>> 0;
  }
  return h;
}

function lexicalOverlap(query: string, candidate: string): number {
  const queryTerms = tokenize(query);
  if (queryTerms.size === 0) return 0;
  const candidateTerms = tokenize(candidate);
  let common = 0;
  for (const term of queryTerms) if (candidateTerms.has(term)) common++;
  return common / queryTerms.size;
}

/** Deterministic pairwise relevance score in [0, 1]: 60% hashed pairwise base, 40% lexical-overlap boost. */
export function mockRerankScore(query: string, candidateText: string): number {
  const base = (hashPair(query.toLowerCase(), candidateText.toLowerCase()) % 1000) / 1000;
  const overlap = lexicalOverlap(query, candidateText);
  return Math.min(1, Math.max(0, base * 0.6 + overlap * 0.4));
}

/** Reranks `candidates` against `query`; returns the untouched input order ("before") alongside the rescored, resorted order ("after"). */
export function rerankCandidates(
  query: string,
  candidates: RetrievalResult[],
): { before: RetrievalResult[]; after: RetrievalResult[] } {
  const before = candidates.map((c, i) => ({ ...c, rank: i }));
  const after = candidates
    .map((c) => ({ ...c, score: mockRerankScore(query, c.text), source: "rerank" as const }))
    .sort((a, b) => b.score - a.score)
    .map((c, i) => ({ ...c, rank: i }));
  return { before, after };
}
