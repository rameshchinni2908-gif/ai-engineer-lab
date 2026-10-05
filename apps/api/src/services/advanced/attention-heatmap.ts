import { approxTokenize } from "../runs/tokenizer.js";

export interface AttentionHeatmapRequest {
  text: string;
}

export interface AttentionHeatmapResult {
  tokens: string[];
  /** `attention[i][j]` = how much token i "attends to" token j (illustrative, see note). Each row sums to ~1. */
  attention: number[][];
  /** Always present, always the same message - never omit this disclosure (CLAUDE.md: never present a simulated number as the model's real internals). */
  note: string;
}

const ILLUSTRATIVE_NOTE =
  "Simulated, for intuition only: hosted provider APIs (including the mock provider) do not expose real attention weights. This heatmap is a heuristic combining token-text similarity and positional distance - it is never the model's actual internal computation.";

/** Deterministic token-text similarity: 1.0 for identical tokens, partial credit for a shared lowercase prefix, else a small baseline. */
function tokenSimilarity(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return 1;
  let shared = 0;
  const max = Math.min(la.length, lb.length);
  while (shared < max && la[shared] === lb[shared]) shared++;
  if (shared === 0) return 0.05;
  return 0.05 + 0.5 * (shared / Math.max(la.length, lb.length));
}

/** Positional-distance decay: closer tokens get more weight, same-position gets the most (self-attention). */
function positionalWeight(i: number, j: number): number {
  const distance = Math.abs(i - j);
  return 1 / (1 + distance);
}

/**
 * `POST /advanced/attention-heatmap`. Purely computed from `text` - no
 * provider call, no `Run` recorded (there is nothing to generate). Every
 * `providerId`/`model` produces the same heuristic output per contracts §4
 * M10's explicit decision that this is illustrative for every provider,
 * including mock.
 */
export function computeAttentionHeatmap(req: AttentionHeatmapRequest): AttentionHeatmapResult {
  const tokens = approxTokenize(req.text)
    .map((t) => t.text)
    .filter((t) => t.trim().length > 0);

  const attention: number[][] = tokens.map((tokenI, i) => {
    const rawRow = tokens.map((tokenJ, j) => {
      const sim = tokenSimilarity(tokenI, tokenJ);
      const pos = positionalWeight(i, j);
      // Causal-ish bias: a token can only meaningfully "look back" in this
      // illustration, matching how decoder-only models actually work -
      // tokens after position i get a heavily reduced (not zero) weight.
      const causalFactor = j <= i ? 1 : 0.15;
      return sim * pos * causalFactor;
    });
    const sum = rawRow.reduce((s, v) => s + v, 0) || 1;
    return rawRow.map((v) => v / sum);
  });

  return { tokens, attention, note: ILLUSTRATIVE_NOTE };
}
