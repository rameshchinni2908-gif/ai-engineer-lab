import type { EvalSuiteResult, MetricId } from "@ail/shared";

export interface CiCheckFailure {
  metricId: MetricId;
  variantIndex: number;
  score: number;
  threshold: number;
}

export interface CiCheckResult {
  pass: boolean;
  failures: CiCheckFailure[];
}

/**
 * Pure: checks every variant's aggregate score for every thresholded metric
 * against its threshold. Backs both `POST /evals/ci-check` and the CI CLI,
 * per contracts §4 M7.
 */
export function checkSuiteAgainstThresholds(
  suite: EvalSuiteResult,
  thresholds: Partial<Record<MetricId, number>>,
): CiCheckResult {
  const failures: CiCheckFailure[] = [];
  suite.aggregates.forEach((variantAggregate, variantIndex) => {
    for (const [metricId, threshold] of Object.entries(thresholds) as [MetricId, number][]) {
      const score = variantAggregate[metricId];
      if (score === undefined) continue; // metric wasn't run for this suite; nothing to gate on
      if (score < threshold) {
        failures.push({ metricId, variantIndex, score, threshold });
      }
    }
  });
  return { pass: failures.length === 0, failures };
}
