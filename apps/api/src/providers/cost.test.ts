import { describe, expect, it } from "vitest";
import { findModel } from "@ail/shared";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";
import { MockProvider } from "./mock.js";

describe("provider.estimateCost against MODEL_CATALOG rates", () => {
  it("Anthropic (claude-sonnet-5) matches MODEL_CATALOG's per-MTok rates", () => {
    const info = findModel("claude-sonnet-5")!;
    const cost = new AnthropicProvider().estimateCost(
      { inputTokens: 2_000_000, outputTokens: 500_000, totalTokens: 2_500_000 },
      "claude-sonnet-5",
    );
    expect(cost.inputCostUsd).toBeCloseTo(2 * info.inputCostPerMTok, 6);
    expect(cost.outputCostUsd).toBeCloseTo(0.5 * info.outputCostPerMTok, 6);
    expect(cost.totalCostUsd).toBeCloseTo(cost.inputCostUsd + cost.outputCostUsd, 6);
  });

  it("OpenAI (gpt-4o-mini) matches MODEL_CATALOG's per-MTok rates", () => {
    const info = findModel("gpt-4o-mini")!;
    const cost = new OpenAIProvider().estimateCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 },
      "gpt-4o-mini",
    );
    expect(cost.inputCostUsd).toBeCloseTo(info.inputCostPerMTok, 6);
    expect(cost.outputCostUsd).toBeCloseTo(info.outputCostPerMTok, 6);
  });

  it("Ollama (local) is always zero cost regardless of token volume", () => {
    const cost = new OllamaProvider().estimateCost(
      { inputTokens: 10_000_000, outputTokens: 10_000_000, totalTokens: 20_000_000 },
      "llama3.1:8b",
    );
    expect(cost.totalCostUsd).toBe(0);
  });

  it("Mock falls back to a sane default model if given an unknown model id", () => {
    const cost = new MockProvider().estimateCost(
      { inputTokens: 100, outputTokens: 100, totalTokens: 200 },
      "totally-unknown-model-id",
    );
    expect(cost.totalCostUsd).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(cost.totalCostUsd)).toBe(true);
  });

  it("doubling output tokens roughly doubles output cost (linear cost model)", () => {
    const provider = new OpenAIProvider();
    const a = provider.estimateCost({ inputTokens: 0, outputTokens: 1000, totalTokens: 1000 }, "gpt-4o");
    const b = provider.estimateCost({ inputTokens: 0, outputTokens: 2000, totalTokens: 2000 }, "gpt-4o");
    expect(b.outputCostUsd).toBeCloseTo(a.outputCostUsd * 2, 10);
  });
});
