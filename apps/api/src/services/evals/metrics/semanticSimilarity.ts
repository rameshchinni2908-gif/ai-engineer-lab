import { cosineSimilarity } from "./vectorMath.js";

/** `semantic_similarity`: cosine similarity (rescaled to 0..1) between the output's and expected's embeddings. Pure given the two vectors - embedding itself happens in the orchestrator via `provider.embed()`. */
export function semanticSimilarity(
  outputEmbedding: number[],
  expectedEmbedding: number[],
): { score: number; rationale: string } {
  const score = cosineSimilarity(outputEmbedding, expectedEmbedding);
  return {
    score,
    rationale: `Cosine similarity between output and expected embeddings (rescaled 0..1): ${score.toFixed(3)}.`,
  };
}
