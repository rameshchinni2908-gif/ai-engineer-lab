import { describe, expect, it } from "vitest";
import {
  calibrateJudge,
  demonstratePositionBias,
  demonstrateSelfEnhancementBias,
  demonstrateVerbosityBias,
} from "./judgeBias.js";

describe("demonstratePositionBias", () => {
  it("detects that a position-biased judge's verdict tracks slot, not content", () => {
    const result = demonstratePositionBias();
    expect(result.biasDetected).toBe(true);
    expect(result.forward.winner).toBe("A");
    expect(result.swapped.winner).toBe("A");
  });
});

describe("demonstrateVerbosityBias", () => {
  it("shows the naive score favoring a much longer response over the length-normalized score", () => {
    const result = demonstrateVerbosityBias(
      "Paris.",
      "Well, to really dig into this, the answer, after much consideration and context-setting, is in fact Paris, the capital city.",
    );
    expect(result.naiveScore).toBeGreaterThan(result.lengthNormalizedScore);
    expect(result.biasDetected).toBe(true);
  });

  it("does not flag bias when lengths are comparable", () => {
    const result = demonstrateVerbosityBias("Paris is the capital.", "Lyon is a city.");
    expect(result.biasDetected).toBe(false);
  });
});

describe("demonstrateSelfEnhancementBias", () => {
  it("flags inflation when judge and candidate share a provider family", () => {
    const result = demonstrateSelfEnhancementBias("anthropic", "anthropic");
    expect(result.biasDetected).toBe(true);
    expect(result.sameFamilyScore).toBeGreaterThan(result.thirdPartyJudgeScore);
  });

  it("reports no bias when judge and candidate are from different families", () => {
    const result = demonstrateSelfEnhancementBias("anthropic", "openai");
    expect(result.biasDetected).toBe(false);
    expect(result.sameFamilyScore).toBe(result.thirdPartyJudgeScore);
  });
});

describe("calibrateJudge", () => {
  it("reports perfect agreement and zero error for identical scores", () => {
    const result = calibrateJudge([
      { caseId: "c1", humanScore: 0.9, judgeScore: 0.9 },
      { caseId: "c2", humanScore: 0.2, judgeScore: 0.2 },
    ]);
    expect(result.agreementRate).toBe(1);
    expect(result.meanAbsoluteError).toBe(0);
    expect(result.correlation).toBeCloseTo(1, 5);
  });

  it("detects disagreement when the judge misclassifies pass/fail", () => {
    const result = calibrateJudge([
      { caseId: "c1", humanScore: 0.9, judgeScore: 0.3 }, // human pass, judge fail
      { caseId: "c2", humanScore: 0.1, judgeScore: 0.1 }, // both fail
    ]);
    expect(result.agreementRate).toBe(0.5);
    expect(result.meanAbsoluteError).toBeGreaterThan(0);
  });

  it("handles the empty-input case without throwing", () => {
    expect(calibrateJudge([])).toEqual({ n: 0, agreementRate: 0, meanAbsoluteError: 0, correlation: 0 });
  });
});
