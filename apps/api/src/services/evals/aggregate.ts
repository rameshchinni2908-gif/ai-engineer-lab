import type { MetricId } from "@ail/shared";

/** Mean of each metric's collected per-case scores, for one variant. */
export function aggregateVariantScores(scoresByMetric: Partial<Record<MetricId, number[]>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [metricId, scores] of Object.entries(scoresByMetric)) {
    if (!scores || scores.length === 0) continue;
    out[metricId] = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }
  return out;
}

export interface Regression {
  metricId: MetricId;
  fromVariantIndex: number;
  toVariantIndex: number;
  delta: number;
}

/**
 * Compares every non-baseline variant's aggregate against the baseline
 * (variant index 0) per metric and flags a regression when the metric drops
 * by more than `threshold` (default 0.05 = 5 percentage points of score).
 * Pure, unit-tested.
 */
export function detectRegressions(
  aggregates: Record<string, number>[],
  metricIds: MetricId[],
  threshold = 0.05,
): Regression[] {
  if (aggregates.length < 2) return [];
  const baseline = aggregates[0]!;
  const regressions: Regression[] = [];
  for (let i = 1; i < aggregates.length; i++) {
    const candidate = aggregates[i]!;
    for (const metricId of metricIds) {
      const baseScore = baseline[metricId];
      const candidateScore = candidate[metricId];
      if (baseScore === undefined || candidateScore === undefined) continue;
      // Rounded to 6 decimal places to avoid float-subtraction dust (e.g. 0.6 - 0.9) leaking into the reported delta.
      const delta = Math.round((candidateScore - baseScore) * 1e6) / 1e6;
      if (delta < -threshold) {
        regressions.push({ metricId, fromVariantIndex: 0, toVariantIndex: i, delta });
      }
    }
  }
  return regressions;
}
