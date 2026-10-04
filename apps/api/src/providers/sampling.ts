import type { LogProb } from "@ail/shared";

/** One sampleable candidate token with its base (unscaled) logit. */
export interface Candidate {
  token: string;
  baseLogit: number;
}

export interface SamplingParams {
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}

const MIN_TEMPERATURE = 1e-4;

/** Pure: softmax over logits (numerically stabilized). */
export function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * Applies temperature scaling + presence/frequency penalties to a candidate
 * set's base logits, returning scaled logits in the same order. Temperature
 * <= 0 is treated as "greedy" (handled by the caller via `isGreedy`), but we
 * still clamp here to avoid division by zero if called directly.
 */
export function scaleLogits(
  candidates: Candidate[],
  params: SamplingParams,
  tokenCounts: Map<string, number>,
): number[] {
  const temperature = Math.max(params.temperature ?? 1, MIN_TEMPERATURE);
  const presence = params.presencePenalty ?? 0;
  const frequency = params.frequencyPenalty ?? 0;
  return candidates.map((c) => {
    const count = tokenCounts.get(c.token) ?? 0;
    const penalty = (count > 0 ? presence : 0) + frequency * count;
    return (c.baseLogit - penalty) / temperature;
  });
}

export function isGreedy(params: SamplingParams): boolean {
  return (params.temperature ?? 1) <= MIN_TEMPERATURE;
}

/**
 * Nucleus (top-p) + top-k truncation over a probability distribution,
 * returning the indices (into the original `candidates` array) that survive,
 * sorted by descending probability. Always keeps at least one index.
 */
export function truncate(
  probs: number[],
  topP: number | undefined,
  topK: number | undefined,
): number[] {
  const order = probs
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p - a.p)
    .map((x) => x.i);

  let kept = order;
  if (typeof topK === "number" && topK > 0) {
    kept = kept.slice(0, topK);
  }
  if (typeof topP === "number" && topP > 0 && topP < 1) {
    const nucleus: number[] = [];
    let cumulative = 0;
    for (const i of kept) {
      nucleus.push(i);
      cumulative += probs[i] ?? 0;
      if (cumulative >= topP) break;
    }
    kept = nucleus.length > 0 ? nucleus : kept.slice(0, 1);
  }
  return kept.length > 0 ? kept : order.slice(0, 1);
}

/**
 * Samples one candidate index given a fully-specified distribution and an
 * RNG, honoring temperature/top-p/top-k/penalties, and returns both the
 * chosen index and a `LogProb` computed from the FULL (pre-truncation)
 * softmax distribution - mirroring how real provider APIs report logprobs
 * independent of the sampling-time truncation filters.
 */
export function sampleCandidate(
  candidates: Candidate[],
  params: SamplingParams,
  tokenCounts: Map<string, number>,
  rng: () => number,
  topAlternativesCount = 3,
): { index: number; logprob: LogProb } {
  const scaledLogits = scaleLogits(candidates, params, tokenCounts);
  const fullProbs = softmax(scaledLogits);

  let chosenIndex: number;
  if (isGreedy(params)) {
    chosenIndex = fullProbs.reduce(
      (best, p, i) => (p > fullProbs[best]! ? i : best),
      0,
    );
  } else {
    const survivors = truncate(fullProbs, params.topP, params.topK);
    const survivorProbs = survivors.map((i) => fullProbs[i] ?? 0);
    const survivorSum = survivorProbs.reduce((a, b) => a + b, 0);
    const renormalized = survivorProbs.map((p) => p / survivorSum);
    const r = rng();
    let acc = 0;
    let pick = survivors[survivors.length - 1]!;
    for (let k = 0; k < survivors.length; k++) {
      acc += renormalized[k] ?? 0;
      if (r <= acc) {
        pick = survivors[k]!;
        break;
      }
    }
    chosenIndex = pick;
  }

  const order = fullProbs
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p - a.p)
    .filter((x) => x.i !== chosenIndex)
    .slice(0, topAlternativesCount);

  const chosen = candidates[chosenIndex]!;
  const logprob: LogProb = {
    token: chosen.token,
    logprob: Math.log(Math.max(fullProbs[chosenIndex] ?? 1e-12, 1e-12)),
    topAlternatives: order.map((o) => ({
      token: candidates[o.i]!.token,
      logprob: Math.log(Math.max(o.p, 1e-12)),
    })),
  };
  return { index: chosenIndex, logprob };
}

/**
 * Measures how "flat" (high-entropy / uniform) a distribution is, 0..1,
 * normalized by the maximum possible entropy for that candidate count.
 * Used by tests to assert temperature monotonicity honestly rather than by
 * eyeballing sampled tokens.
 */
export function normalizedEntropy(probs: number[]): number {
  const n = probs.length;
  if (n <= 1) return 0;
  const entropy = -probs.reduce((acc, p) => acc + (p > 0 ? p * Math.log(p) : 0), 0);
  return entropy / Math.log(n);
}
