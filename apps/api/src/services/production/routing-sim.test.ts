import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-routing-sim.db");

const { closeDb } = await import("../../db/index.js");
const { runRoutingSim } = await import("./routing-sim.js");

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

  it("computes baselineCostUsd from real calls against the single most expensive candidate for every request", async () => {
    const result = await runRoutingSim({
      requests: [{ prompt: "a" }, { prompt: "b" }],
      strategy: "cheapest",
      candidateModels: ["mock-small", "mock-large"],
    });
    expect(result.assignments).toHaveLength(2);
    expect(typeof result.baselineCostUsd).toBe("number");
    expect(result.totalCostUsd).toBeGreaterThanOrEqual(0);
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
