/**
 * Pure similarity/distance metrics over equal-length numeric vectors. Used by
 * `/embeddings/similarity`, the embedding explorer's neighbour ranking, and
 * the index trade-offs demo's ground-truth comparison. No provider/network
 * dependency - these are plain math functions, trivially unit-testable.
 */

export type SimilarityMetric = "cosine" | "dot" | "euclidean";

function assertSameLength(a: number[], b: number[]): void {
  if (a.length !== b.length) {
    throw new Error(`vector dimension mismatch: ${a.length} !== ${b.length}`);
  }
  if (a.length === 0) {
    throw new Error("vectors must have at least one dimension");
  }
}

export function dotProduct(a: number[], b: number[]): number {
  assertSameLength(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

export function magnitude(a: number[]): number {
  return Math.sqrt(a.reduce((acc, v) => acc + v * v, 0));
}

/** Cosine similarity: the angle between two vectors, ignoring magnitude. Range [-1, 1] for real vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  assertSameLength(a, b);
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

/** Euclidean (L2) distance. Lower = more similar, unlike cosine/dot where higher = more similar. */
export function euclideanDistance(a: number[], b: number[]): number {
  assertSameLength(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Dispatches to the named metric. Callers that rank candidates must know
 * that `euclidean` is a DISTANCE (ascending = better) while `cosine`/`dot`
 * are SIMILARITIES (descending = better) - the UI and `/vector` search
 * ranking logic must sort accordingly, never assume "higher is always better".
 */
export function computeSimilarity(a: number[], b: number[], metric: SimilarityMetric): number {
  switch (metric) {
    case "cosine":
      return cosineSimilarity(a, b);
    case "dot":
      return dotProduct(a, b);
    case "euclidean":
      return euclideanDistance(a, b);
  }
}

/** `true` iff higher `computeSimilarity` values rank better for this metric (false for euclidean). */
export function isHigherBetter(metric: SimilarityMetric): boolean {
  return metric !== "euclidean";
}
