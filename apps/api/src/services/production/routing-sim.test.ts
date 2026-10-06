import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-routing-sim.db");

const { closeDb } = await import("../../db/index.js");
const { runRoutingSim } = await import("./routing-sim.js");
const { MockProvider } = await import("../../providers/mock.js");

// mock-small has inputCostPerMTok/outputCostPerMTok lower than mock-large in
// the catalog's relative terms? Both are 0 (free mock models) - these tests
// assert MODEL SELECTION behavior (the actual routing decision), not dollar
// amounts, since mock models are intentionally free per CLAUDE.md.
describe("routing-sim: model selection strategies", () => {
  afterAll(() => closeDb());

  it("'cheapest' strategy always assigns the lowest-cost candidate", async () => {
    const result = await runRoutingSim({
      requests: [{ prompt: "hello" }, { prompt: "world, a longer question here" }],
      strategy: "cheapest",
      candidateModels: ["mock-small", "mock-large"],
    });
    expect(result.assignments.every((a) => a.model === "mock-small")).toBe(true);
  });

  it("'complexity-based' strategy escalates only 'high' complexity requests", async () => {
    const result = await runRoutingSim({
      requests: [
        { prompt: "simple", complexity: "low" },
        { prompt: "hard one", complexity: "high" },
      ],
      strategy: "complexity-based",
      candidateModels: ["mock-small", "mock-large"],
    });
    expect(result.assignments[0]!.model).toBe("mock-small");
    expect(result.assignments[1]!.model).toBe("mock-large");
  });

  it("'fallback-chain' strategy escalates longer/harder-looking prompts past the cheapest model", async () => {
    const longPrompt = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const result = await runRoutingSim({
      requests: [{ prompt: "short" }, { prompt: longPrompt }],
      strategy: "fallback-chain",
      candidateModels: ["mock-small", "mock-large"],
    });
    expect(result.assignments[0]!.model).toBe("mock-small");
    expect(result.assignments[1]!.model).toBe("mock-large");
  });

  describe("cost accounting (non-zero rates via a stubbed estimateCost, since every mock catalog model is $0)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("computes totalCostUsd/baselineCostUsd as the EXACT sum of each call's real (measured) cost, not an estimated multiplier", async () => {
      // Stub MockProvider.estimateCost to return distinguishable, non-zero
      // costs per model - the real catalog has no non-zero-rate "mock"
      // provider entry, so without this stub `toBe(0)` would be
      // indistinguishable from a dropped/broken accumulation. The stub only
      // replaces the RATE; the accumulation logic under test (summing each
      // call's measured `run.cost.totalCostUsd`) is exercised unchanged.
      const COSTS: Record<string, number> = { "mock-small": 0.01, "mock-large": 0.05 };
      vi.spyOn(MockProvider.prototype, "estimateCost").mockImplementation((_usage, model: string) => {
        const c = COSTS[model] ?? 0;
        return { inputCostUsd: c, outputCostUsd: 0, totalCostUsd: c, currency: "USD" as const };
      });

      const result = await runRoutingSim({
        requests: [{ prompt: "a" }, { prompt: "b" }],
        strategy: "cheapest",
        candidateModels: ["mock-small", "mock-large"],
      });

      expect(result.assignments).toHaveLength(2);
      // "cheapest" always assigns mock-small here (both catalog rates are $0
      // so it sorts first/cheapest by the real combinedRate tie-break).
      expect(result.assignments.every((a) => a.model === "mock-small")).toBe(true);
      expect(result.assignments.every((a) => a.costUsd === 0.01)).toBe(true);
      expect(result.totalCostUsd).toBe(0.02); // 2 requests x mock-small's stubbed $0.01
      // baselineCostUsd must be computed against the priciest candidate
      // (mock-large) for EVERY request, regardless of what was actually assigned.
      expect(result.baselineCostUsd).toBe(0.1); // 2 requests x mock-large's stubbed $0.05
    });
  });

  it("rejects an unknown candidate model", async () => {
    await expect(
      runRoutingSim({
        requests: [{ prompt: "a" }],
        strategy: "cheapest",
        candidateModels: ["not-a-real-model"],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
