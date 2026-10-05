import { describe, expect, it } from "vitest";
import { scoreAdaptationTechniques } from "./adaptationScoring";

describe("scoreAdaptationTechniques", () => {
  it("recommends RAG for small data + frequent drift (the canonical RAG case)", () => {
    const result = scoreAdaptationTechniques({
      dataVolume: "small",
      latencyBudget: "relaxed",
      costCeiling: "low",
      driftRate: "frequent",
    });
    expect(result.recommended).toBe("rag");
    expect(result.rationale).toContain("rag");
  });

  it("recommends fine-tune for large stable data with a high cost ceiling", () => {
    const result = scoreAdaptationTechniques({
      dataVolume: "large",
      latencyBudget: "relaxed",
      costCeiling: "high",
      driftRate: "stable",
    });
    expect(result.recommended).toBe("fine-tune");
  });

  it("recommends distillation for a tight latency budget with large data and high cost ceiling", () => {
    const result = scoreAdaptationTechniques({
      dataVolume: "large",
      latencyBudget: "tight",
      costCeiling: "high",
      driftRate: "stable",
    });
    expect(result.recommended).toBe("distillation");
  });

  it("every technique's score is traceable to at least one reason when it scores non-zero", () => {
    const result = scoreAdaptationTechniques({
      dataVolume: "medium",
      latencyBudget: "moderate",
      costCeiling: "medium",
      driftRate: "occasional",
    });
    for (const s of result.scores) {
      if (s.score !== 0) expect(s.reasons.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic for the same inputs", () => {
    const inputs = { dataVolume: "small", latencyBudget: "tight", costCeiling: "low", driftRate: "stable" } as const;
    expect(scoreAdaptationTechniques(inputs)).toEqual(scoreAdaptationTechniques(inputs));
  });
});
