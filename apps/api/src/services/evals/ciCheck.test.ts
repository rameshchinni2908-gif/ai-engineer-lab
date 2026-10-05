import { describe, expect, it } from "vitest";
import type { EvalSuiteResult } from "@ail/shared";
import { checkSuiteAgainstThresholds } from "./ciCheck.js";

function suite(aggregates: Record<string, number>[]): EvalSuiteResult {
  return {
    id: "suite_1",
    datasetId: "dataset_1",
    variants: aggregates.map(() => ({ promptVersionId: "pv_1", providerId: "mock", model: "mock-small" })),
    rows: [],
    aggregates,
    regressions: [],
    totalCost: 0,
    totalLatencyMs: 0,
    createdAt: new Date().toISOString(),
  };
}

describe("checkSuiteAgainstThresholds", () => {
  it("passes when every variant meets every threshold", () => {
    const result = checkSuiteAgainstThresholds(suite([{ exact_match: 0.9 }]), { exact_match: 0.8 });
    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails and reports the specific metric/variant/score when below threshold", () => {
    const result = checkSuiteAgainstThresholds(suite([{ exact_match: 0.9 }, { exact_match: 0.5 }]), {
      exact_match: 0.8,
    });
    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([{ metricId: "exact_match", variantIndex: 1, score: 0.5, threshold: 0.8 }]);
  });

  it("ignores thresholds for metrics that were not run", () => {
    const result = checkSuiteAgainstThresholds(suite([{ exact_match: 0.9 }]), { rag_faithfulness: 0.9 });
    expect(result.pass).toBe(true);
  });
});
