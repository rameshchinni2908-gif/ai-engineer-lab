/**
 * The four RAG metrics (`rag_faithfulness`, `rag_answer_relevance`,
 * `rag_context_precision`, `rag_context_recall`). Deterministic lexical-
 * overlap heuristics - NOT a replacement for a real NLI-based faithfulness
 * checker, but fully pure/offline so the eval module works with zero
 * provider keys, and clearly documented as such in the Learn content.
 *
 * Convention (matches the `evals.learn` "faithfulness/relevance separate
 * from precision/recall" framing): `EvalCase.input.query` is the question,
 * `EvalCase.input.context` is the retrieved context (string or string[]),
 * `EvalCase.expected` is the reference answer.
 */
import { splitSentences, wordOverlapRatio, wordSet } from "./vectorMath.js";

export function toContextArray(context: unknown): string[] {
  if (Array.isArray(context)) return context.map(String);
  if (typeof context === "string" && context.length > 0) return [context];
  return [];
}

/** Fraction of the output's sentences that have meaningful word overlap with SOME context chunk - "is the answer grounded in what was retrieved?" */
export function ragFaithfulness(output: string, contexts: string[]): { score: number; rationale: string } {
  const sentences = splitSentences(output);
  if (sentences.length === 0) return { score: 0, rationale: "Output had no sentences to check." };
  const contextWords = contexts.map(wordSet);
  let supported = 0;
  for (const sentence of sentences) {
    const sentenceWords = wordSet(sentence);
    const maxOverlap = contextWords.reduce((max, cw) => Math.max(max, wordOverlapRatio(sentenceWords, cw)), 0);
    if (maxOverlap >= 0.4) supported++;
  }
  const score = supported / sentences.length;
  return {
    score,
    rationale: `${supported}/${sentences.length} output sentences had >=40% word overlap with some retrieved context chunk.`,
  };
}

/** Similarity between the output and the original query - "did the answer actually address what was asked?" */
export function ragAnswerRelevance(output: string, query: string): { score: number; rationale: string } {
  const score = wordOverlapRatio(wordSet(query), wordSet(output));
  return {
    score,
    rationale: `${(score * 100).toFixed(0)}% of the query's words appear in the output (lexical relevance proxy).`,
  };
}

/** Fraction of retrieved context chunks that are actually relevant to the expected answer - a retrieval-stage metric. */
export function ragContextPrecision(contexts: string[], expected: string): { score: number; rationale: string } {
  if (contexts.length === 0) return { score: 0, rationale: "No context chunks were retrieved." };
  const expectedWords = wordSet(expected);
  let relevant = 0;
  for (const c of contexts) {
    if (wordOverlapRatio(expectedWords, wordSet(c)) >= 0.2) relevant++;
  }
  const score = relevant / contexts.length;
  return {
    score,
    rationale: `${relevant}/${contexts.length} retrieved chunks overlapped >=20% with the expected answer's key words.`,
  };
}

/** Fraction of the expected answer's key words that show up SOMEWHERE across all retrieved context - "did retrieval find what was needed?" */
export function ragContextRecall(contexts: string[], expected: string): { score: number; rationale: string } {
  const expectedWords = wordSet(expected);
  if (expectedWords.size === 0) return { score: 0, rationale: "Expected answer had no scorable content." };
  const combined = new Set<string>();
  for (const c of contexts) for (const w of wordSet(c)) combined.add(w);
  const score = wordOverlapRatio(expectedWords, combined);
  return {
    score,
    rationale: `${(score * 100).toFixed(0)}% of the expected answer's key words were present somewhere in the retrieved context.`,
  };
}
