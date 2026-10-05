/**
 * `latency` and `cost`: normalize a Run's measured `latencyMs`/`cost.totalCostUsd`
 * against a per-case (or default) threshold into a 0..1 score, where 1 means
 * "at or under the target" and 0 means "at or beyond 2x the target".
 * Thresholds come from `EvalCase.metadata.latencyThresholdMs` /
 * `costThresholdUsd` when set, else sensible module defaults.
 */

export const DEFAULT_LATENCY_THRESHOLD_MS = 3000;
export const DEFAULT_COST_THRESHOLD_USD = 0.01;

function scoreAgainstThreshold(value: number, threshold: number): number {
  if (threshold <= 0) return value <= 0 ? 1 : 0;
  if (value <= threshold) return 1;
  const ratio = value / threshold; // > 1
  if (ratio >= 2) return 0;
  return Math.max(0, 1 - (ratio - 1));
}

export function latencyMetric(
  latencyMs: number,
  thresholdMs: number = DEFAULT_LATENCY_THRESHOLD_MS,
): { score: number; rationale: string } {
  const score = scoreAgainstThreshold(latencyMs, thresholdMs);
  return {
    score,
    rationale: `Run took ${latencyMs.toFixed(0)}ms against a ${thresholdMs}ms target (score ${score.toFixed(2)}).`,
  };
}

export function costMetric(
  costUsd: number,
  thresholdUsd: number = DEFAULT_COST_THRESHOLD_USD,
): { score: number; rationale: string } {
  const score = scoreAgainstThreshold(costUsd, thresholdUsd);
  return {
    score,
    rationale: `Run cost $${costUsd.toFixed(5)} against a $${thresholdUsd.toFixed(5)} target (score ${score.toFixed(2)}).`,
  };
}
