/**
 * Pure Reciprocal Rank Fusion: combines several independently-ranked id
 * lists (e.g. BM25's ranking and vector search's ranking) by RANK POSITION
 * rather than raw score. This matters because heterogeneous retrievers'
 * scores live on incomparable scales (a BM25 score of 12.4 vs. a cosine
 * similarity of 0.82) - naive score-averaging lets whichever happens to have
 * the larger numeric range dominate for reasons unrelated to relevance.
 */

export interface RrfResult {
  id: string;
  score: number;
  /** Each input ranking's 1-based rank for this id, keyed by that ranking's index; absent if it didn't appear in that list. */
  ranks: (number | undefined)[];
}

/**
 * `rankings[i]` is an ordered list of ids (best first) from retriever `i`.
 * `k` is RRF's smoothing constant (60 is the standard default from the
 * original paper - it dampens the influence of very low ranks).
 */
export function reciprocalRankFusion(rankings: string[][], k = 60): RrfResult[] {
  const scoreById = new Map<string, number>();
  const ranksById = new Map<string, (number | undefined)[]>();

  rankings.forEach((ranking, listIndex) => {
    ranking.forEach((id, idx) => {
      const rank = idx + 1;
      scoreById.set(id, (scoreById.get(id) ?? 0) + 1 / (k + rank));
      const ranks = ranksById.get(id) ?? new Array(rankings.length).fill(undefined);
      ranks[listIndex] = rank;
      ranksById.set(id, ranks);
    });
  });

  return [...scoreById.entries()]
    .map(([id, score]) => ({ id, score, ranks: ranksById.get(id) ?? [] }))
    .sort((a, b) => b.score - a.score);
}
