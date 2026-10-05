/**
 * `pairwise`: compares two candidate outputs ("A" and "B") for the same
 * input and returns which one the judge preferred. Pure prompt/parse halves,
 * same split rationale as `llmJudge.ts`. The orchestrator in `runner.ts`
 * (and the judge-bias calibration lab) is responsible for running this
 * TWICE with A/B swapped to detect and demonstrate position bias.
 */

import { wordOverlapRatio, wordSet } from "./vectorMath.js";

export interface PairwisePromptArgs {
  input: string;
  a: string;
  b: string;
}

export function buildPairwisePrompt(args: PairwisePromptArgs): string {
  return [
    `You are comparing two candidate responses to the same input. Decide which is better overall.`,
    `Input:\n${args.input}`,
    `Response A:\n${args.a}`,
    `Response B:\n${args.b}`,
    `Respond with ONLY a JSON object: {"winner": "A" | "B" | "tie", "rationale": "<one sentence>"}.`,
  ].join("\n\n");
}

export type PairwiseWinner = "A" | "B" | "tie";

export interface PairwiseVerdict {
  winner: PairwiseWinner;
  rationale: string;
}

export function parsePairwiseResponse(text: string): PairwiseVerdict {
  const jsonMatch = text.match(/\{[^{}]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { winner?: unknown; rationale?: unknown };
      if (parsed.winner === "A" || parsed.winner === "B" || parsed.winner === "tie") {
        return {
          winner: parsed.winner,
          rationale: typeof parsed.rationale === "string" ? parsed.rationale : "(no rationale given)",
        };
      }
    } catch {
      // fall through
    }
  }
  const upper = text.toUpperCase();
  if (upper.includes('"A"') || /\bA\b/.test(upper.slice(0, 20))) {
    return { winner: "A", rationale: "Parsed from non-JSON judge response (fell back to first mentioned letter)." };
  }
  return { winner: "tie", rationale: "Could not parse a clear winner from the judge response; defaulted to tie." };
}

/** `pairwise` metric score from the evaluated variant's point of view: 1 if it won, 0.5 for a tie, 0 if it lost. `evaluatedSlot` says whether the output being scored was shown as "A" or "B". */
export function pairwiseScore(verdict: PairwiseVerdict, evaluatedSlot: "A" | "B"): number {
  if (verdict.winner === "tie") return 0.5;
  return verdict.winner === evaluatedSlot ? 1 : 0;
}

/** True if running the same comparison with A/B swapped produced a verdict that tracks the SAME response both times (no position bias detected for this pair). */
export function verdictsAgreeAfterSwap(forward: PairwiseVerdict, swapped: PairwiseVerdict): boolean {
  if (forward.winner === "tie" || swapped.winner === "tie") return forward.winner === swapped.winner;
  // swapped run has A/B flipped, so "the same underlying response won" means the letters disagree.
  return forward.winner !== swapped.winner;
}

/** Deterministic lexical-overlap fallback used when the generating provider is `mock` - see `heuristicJudgeScore` in `llmJudge.ts` for the same rationale. */
export function heuristicPairwiseVerdict(a: string, b: string, expected?: string): PairwiseVerdict {
  if (!expected) {
    return { winner: "tie", rationale: "Mock-judge heuristic: no reference answer supplied, defaulted to tie." };
  }
  const expectedWords = wordSet(expected);
  const scoreA = wordOverlapRatio(expectedWords, wordSet(a));
  const scoreB = wordOverlapRatio(expectedWords, wordSet(b));
  if (Math.abs(scoreA - scoreB) < 1e-9) {
    return { winner: "tie", rationale: "Mock-judge heuristic: both responses had equal lexical overlap with the expected answer." };
  }
  return {
    winner: scoreA > scoreB ? "A" : "B",
    rationale: `Mock-judge heuristic: response ${scoreA > scoreB ? "A" : "B"} had higher lexical overlap with the expected answer (${scoreA.toFixed(2)} vs ${scoreB.toFixed(2)}).`,
  };
}
