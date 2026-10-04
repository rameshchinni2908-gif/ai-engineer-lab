import { describe, expect, it } from "vitest";
import { MODEL_CATALOG, estimateCostUsd, findModel } from "./models.js";

describe("model catalog", () => {
  it("contains the required mock models with zero cost", () => {
    const small = findModel("mock-small");
    const large = findModel("mock-large");
    expect(small).toBeDefined();
    expect(large).toBeDefined();
    expect(small?.inputCostPerMTok).toBe(0);
    expect(large?.outputCostPerMTok).toBe(0);
  });

  it("has unique model ids", () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("estimateCostUsd", () => {
  it("computes a weighted cost from input/output token rates", () => {
    const cost = estimateCostUsd(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      { inputCostPerMTok: 3, outputCostPerMTok: 15 },
    );
    expect(cost.inputCostUsd).toBeCloseTo(3);
    expect(cost.outputCostUsd).toBeCloseTo(15);
    expect(cost.totalCostUsd).toBeCloseTo(18);
  });

  it("returns zero cost for mock models", () => {
    const mock = findModel("mock-small");
    if (!mock) throw new Error("mock-small not found");
    const cost = estimateCostUsd({ inputTokens: 500, outputTokens: 500 }, mock);
    expect(cost.totalCostUsd).toBe(0);
  });
});
