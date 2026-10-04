import { describe, expect, it } from "vitest";
import { AgentLimitsSchema } from "./agent.js";

describe("AgentLimitsSchema", () => {
  it("round-trips all five tunable controls: max steps, budget, timeout, loop detection, approval", () => {
    const limits = {
      maxSteps: 20,
      budgetUsd: 0.5,
      timeoutMs: 60_000,
      loopDetection: { enabled: true, window: 4, similarityThreshold: 0.9 },
      requireApprovalForDangerousTools: true,
      approvalRequiredTools: ["http_fetch"],
    };
    const parsed = AgentLimitsSchema.parse(limits);
    expect(parsed.loopDetection.window).toBe(4);
    expect(parsed.requireApprovalForDangerousTools).toBe(true);
    expect(parsed.approvalRequiredTools).toEqual(["http_fetch"]);
  });

  it("allows omitting the optional approvalRequiredTools list", () => {
    const parsed = AgentLimitsSchema.parse({
      maxSteps: 10,
      budgetUsd: 1,
      timeoutMs: 30_000,
      loopDetection: { enabled: false, window: 3, similarityThreshold: 0.85 },
      requireApprovalForDangerousTools: false,
    });
    expect(parsed.approvalRequiredTools).toBeUndefined();
  });
});
