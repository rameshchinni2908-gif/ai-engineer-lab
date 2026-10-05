import { describe, expect, it } from "vitest";
import { aggregateVariantScores, detectRegressions } from "./aggregate.js";

describe("aggregateVariantScores", () => {
  it("computes the mean score per metric", () => {
    const result = aggregateVariantScores({ exact_match: [1, 0, 1, 1], latency: [0.8, 1] });
    expect(result.exact_match).toBeCloseTo(0.75, 5);
    expect(result.latency).toBeCloseTo(0.9, 5);
  });
  it("omits metrics with no scores", () => {
    expect(aggregateVariantScores({ exact_match: [] })).toEqual({});
  });
});

describe("detectRegressions", () => {
  it("flags a metric that dropped by more than the threshold vs the baseline variant", () => {
    const aggregates = [{ exact_match: 0.9 }, { exact_match: 0.6 }];
    const regressions = detectRegressions(aggregates, ["exact_match"], 0.05);
    expect(regressions).toEqual([
      { metricId: "exact_match", fromVariantIndex: 0, toVariantIndex: 1, delta: -0.3 },
    ]);
  });
  it("does not flag a drop within the threshold", () => {
    const aggregates = [{ exact_match: 0.9 }, { exact_match: 0.87 }];
    expect(detectRegressions(aggregates, ["exact_match"], 0.05)).toEqual([]);
  });
  it("does not flag an improvement", () => {
    const aggregates = [{ exact_match: 0.6 }, { exact_match: 0.9 }];
    expect(detectRegressions(aggregates, ["exact_match"], 0.05)).toEqual([]);
  });
  it("returns no regressions with fewer than 2 variants", () => {
    expect(detectRegressions([{ exact_match: 0.5 }], ["exact_match"])).toEqual([]);
  });
});
