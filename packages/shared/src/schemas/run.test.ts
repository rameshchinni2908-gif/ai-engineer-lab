import { describe, expect, it } from "vitest";
import { RunSchema } from "./run.js";

describe("RunSchema", () => {
  it("round-trips a complete mock run", () => {
    const run = {
      id: "run_1",
      moduleId: "fundamentals",
      feature: "sampling-lab",
      providerId: "mock",
      model: "mock-small",
      params: { temperature: 0.7, maxTokens: 256 },
      input: { messages: [{ role: "user", content: "hello" }] },
      output: { text: "hi there", finishReason: "stop" },
      usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
      cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, currency: "USD" as const },
      latencyMs: 120,
      status: "complete",
      createdAt: new Date().toISOString(),
      tags: [],
      metadata: {},
    };

    const parsed = RunSchema.parse(run);
    expect(parsed.id).toBe("run_1");
    expect(parsed.usage.totalTokens).toBe(15);
  });

  it("rejects an invalid moduleId", () => {
    const bad = {
      id: "run_2",
      moduleId: "not-a-module",
      feature: "x",
      providerId: "mock",
      model: "mock-small",
      params: {},
      input: { messages: [] },
      output: { text: "" },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, currency: "USD" },
      latencyMs: 0,
      status: "complete",
      createdAt: new Date().toISOString(),
      tags: [],
      metadata: {},
    };
    expect(() => RunSchema.parse(bad)).toThrow();
  });
});
