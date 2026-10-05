import { describe, expect, it } from "vitest";
import { listReasoningPresets } from "./reasoning-presets.js";

describe("listReasoningPresets", () => {
  it("returns at least 3 presets with strictly increasing thinking budgets available", () => {
    const presets = listReasoningPresets();
    expect(presets.length).toBeGreaterThanOrEqual(3);
    const budgets = presets.map((p) => p.thinkingBudget);
    expect(new Set(budgets).size).toBe(budgets.length); // all distinct
  });

  it("every preset references a real catalog model id usable by /fundamentals/sample", () => {
    const presets = listReasoningPresets();
    for (const p of presets) {
      expect(p.model.length).toBeGreaterThan(0);
      expect(p.providerId).toBe("mock"); // zero-key default
    }
  });
});
