/**
 * Judge-bias education + calibration (contracts §4 M7: "demonstrate position
 * bias, verbosity bias, and self-enhancement bias with runnable before/after
 * examples; let the user calibrate the judge against human-labelled cases").
 *
 * The three bias demos are deterministic, offline simulations of a biased
 * judge model (same honesty convention as the attention-heatmap/quantization
 * demos elsewhere in this app: clearly labeled illustrative, not a live
 * provider call) so they work identically in every mode including zero-key
 * Mock, and so a "before" (naive) run and "after" (mitigated) run are
 * directly comparable and testable. The calibration function, separately,
 * operates on REAL judge scores the caller already produced (e.g. from
 * `runLlmJudge` in `runner.ts`) against human labels.
 */
import { verdictsAgreeAfterSwap, type PairwiseVerdict } from "./metrics/pairwise.js";

// ---------------------------------------------------------------------------
// Position bias
// ---------------------------------------------------------------------------

export interface PositionBiasDemoResult {
  forward: PairwiseVerdict;
  swapped: PairwiseVerdict;
  biasDetected: boolean;
  explanation: string;
}

/**
 * Simulates a judge with a documented "prefer whichever response is shown
 * first" tendency comparing two responses that are, in fact, equally good.
 * The "naive" (single-order) run looks confident; running it again with the
 * slots swapped exposes that the verdict just tracked position, not quality.
 */
export function demonstratePositionBias(): PositionBiasDemoResult {
  // The simulated biased judge always picks slot "A" when quality is tied -
  // modeling the documented tendency, not a real provider call.
  const forward: PairwiseVerdict = {
    winner: "A",
    rationale: "(simulated biased judge) Response A chosen - responses are actually equivalent in quality.",
  };
  const swapped: PairwiseVerdict = {
    winner: "A",
    rationale: "(simulated biased judge) Response A chosen again, even though the SAME underlying response that was 'B' last time is now in slot A.",
  };
  const biasDetected = !verdictsAgreeAfterSwap(forward, swapped);
  return {
    forward,
    swapped,
    biasDetected,
    explanation: biasDetected
      ? "The verdict tracked SLOT POSITION, not response identity: swapping which response was shown as 'A' flipped nothing, which is only possible if the judge is reacting to position rather than content. Mitigation: always run both orderings and discard/flag verdicts that don't agree after accounting for the swap."
      : "No position bias detected in this run - the verdict correctly tracked the same underlying response across both orderings.",
  };
}

// ---------------------------------------------------------------------------
// Verbosity bias
// ---------------------------------------------------------------------------

export interface VerbosityBiasDemoResult {
  naiveScore: number; // 0..1, biased by length
  lengthNormalizedScore: number; // 0..1, length-penalty removed
  biasDetected: boolean;
  explanation: string;
}

/**
 * A terse, fully correct response vs. a much longer response that pads
 * correct content with filler. A naive judge scoring heuristic that rewards
 * length rates the padded one higher; a length-normalized rubric (explicit
 * "do not reward length" instruction, simulated here as a per-character
 * penalty) corrects it.
 */
export function demonstrateVerbosityBias(conciseCorrect: string, verbosePadded: string): VerbosityBiasDemoResult {
  // Naive heuristic: length alone pushes score up (bounded).
  const naiveScore = clamp01(0.5 + Math.min(0.4, verbosePadded.length / conciseCorrect.length / 20));
  // Length-normalized: same core content, so once length stops being rewarded, scores converge.
  const lengthNormalizedScore = 0.55;
  const biasDetected = naiveScore > lengthNormalizedScore + 0.05;
  return {
    naiveScore,
    lengthNormalizedScore,
    biasDetected,
    explanation: biasDetected
      ? `The naive score (${naiveScore.toFixed(2)}) rewarded the longer response purely for length. A length-normalized rubric that explicitly instructs the judge to ignore verbosity brings the score back down to ${lengthNormalizedScore.toFixed(2)}, closer to what the actual content warrants.`
      : "No meaningful verbosity bias detected between the naive and length-normalized scores for these two inputs.",
  };
}

// ---------------------------------------------------------------------------
// Self-enhancement bias
// ---------------------------------------------------------------------------

export interface SelfEnhancementBiasDemoResult {
  sameFamilyScore: number;
  thirdPartyJudgeScore: number;
  biasDetected: boolean;
  explanation: string;
}

/**
 * A judge drawn from the SAME model family as one of the candidates tends
 * to score that candidate's output higher than an unrelated third-party
 * judge would, for equivalent quality. Simulated via a fixed bonus applied
 * only in the same-family case.
 */
export function demonstrateSelfEnhancementBias(
  judgeProviderId: string,
  candidateProviderId: string,
): SelfEnhancementBiasDemoResult {
  const sameFamily = judgeProviderId === candidateProviderId;
  const baseScore = 0.7;
  const sameFamilyScore = sameFamily ? clamp01(baseScore + 0.15) : baseScore;
  const thirdPartyJudgeScore = baseScore;
  const biasDetected = sameFamilyScore > thirdPartyJudgeScore;
  return {
    sameFamilyScore,
    thirdPartyJudgeScore,
    biasDetected,
    explanation: biasDetected
      ? `Using a judge from the same provider family ("${judgeProviderId}") as the candidate being scored ("${candidateProviderId}") inflated the score to ${sameFamilyScore.toFixed(2)} vs. ${thirdPartyJudgeScore.toFixed(2)} from an unrelated third-party judge for equivalent output. Mitigation: use a judge from a provider family unrelated to any compared candidate.`
      : `No self-enhancement bias is modeled here because the judge ("${judgeProviderId}") and candidate ("${candidateProviderId}") are from different provider families.`,
  };
}

// ---------------------------------------------------------------------------
// Calibration against human-labelled cases
// ---------------------------------------------------------------------------

export interface CalibrationCase {
  caseId: string;
  humanScore: number; // 0..1
  judgeScore: number; // 0..1
}

export interface CalibrationResult {
  n: number;
  agreementRate: number; // fraction where human-pass/judge-pass agree at a 0.5 threshold
  meanAbsoluteError: number;
  correlation: number; // Pearson r, NaN-safe (0 when undefined)
}

/** Pure: compares judge scores to human labels on the same cases, for the "validate before trusting" workflow CLAUDE.md/content calls for. */
export function calibrateJudge(cases: CalibrationCase[]): CalibrationResult {
  if (cases.length === 0) {
    return { n: 0, agreementRate: 0, meanAbsoluteError: 0, correlation: 0 };
  }
  const n = cases.length;
  let agree = 0;
  let totalAbsError = 0;
  for (const c of cases) {
    const humanPass = c.humanScore >= 0.5;
    const judgePass = c.judgeScore >= 0.5;
    if (humanPass === judgePass) agree++;
    totalAbsError += Math.abs(c.humanScore - c.judgeScore);
  }
  const humanMean = cases.reduce((s, c) => s + c.humanScore, 0) / n;
  const judgeMean = cases.reduce((s, c) => s + c.judgeScore, 0) / n;
  let cov = 0;
  let humanVar = 0;
  let judgeVar = 0;
  for (const c of cases) {
    const dh = c.humanScore - humanMean;
    const dj = c.judgeScore - judgeMean;
    cov += dh * dj;
    humanVar += dh * dh;
    judgeVar += dj * dj;
  }
  const denom = Math.sqrt(humanVar * judgeVar);
  const correlation = denom === 0 ? 0 : cov / denom;
  return {
    n,
    agreementRate: agree / n,
    meanAbsoluteError: totalAbsError / n,
    correlation,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
