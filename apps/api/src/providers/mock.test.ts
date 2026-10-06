import { describe, expect, it } from "vitest";
import type { GenerateRequest, LogProb } from "@ail/shared";
import { MockProvider } from "./mock.js";

const provider = new MockProvider();

function req(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    model: "mock-small",
    messages: [{ role: "user", content: "Please explain retrieval augmented generation briefly." }],
    ...overrides,
  };
}

async function drainStream(r: GenerateRequest) {
  const tokens: string[] = [];
  const logprobs: LogProb[] = [];
  let done: Awaited<ReturnType<MockProvider["generate"]>> | undefined;
  for await (const ev of provider.stream(r)) {
    if (ev.type === "token") tokens.push(ev.token);
    if (ev.type === "logprobs") logprobs.push(...ev.logprobs);
    if (ev.type === "done") done = ev.result;
  }
  return { tokens, logprobs, result: done! };
}

function avgChosenProb(logprobs: LogProb[]): number {
  return logprobs.reduce((acc, lp) => acc + Math.exp(lp.logprob), 0) / logprobs.length;
}

describe("MockProvider determinism", () => {
  it("same (model, messages, params.seed) ⇒ byte-identical generate() output", async () => {
    const r = req({ params: { temperature: 0.8, seed: 42 } });
    const a = await provider.generate(r);
    const b = await provider.generate(r);
    expect(a.text).toBe(b.text);
    expect(a.logprobs).toEqual(b.logprobs);
    expect(a.usage).toEqual(b.usage);
  });

  it("same inputs ⇒ byte-identical stream() token sequence", async () => {
    const r = req({ params: { temperature: 1.1, seed: 7, maxTokens: 10 } });
    const a = await drainStream(r);
    const b = await drainStream(r);
    expect(a.tokens).toEqual(b.tokens);
    expect(a.result.text).toBe(b.result.text);
  });

  it("different seeds (same everything else) produce different output", async () => {
    const a = await provider.generate(req({ params: { temperature: 1.2, seed: 1 } }));
    const b = await provider.generate(req({ params: { temperature: 1.2, seed: 2 } }));
    expect(a.text).not.toBe(b.text);
  });
});

describe("MockProvider temperature honesty", () => {
  it("temperature 0 is greedy/deterministic regardless of topP/topK (same seed)", async () => {
    const seed = 1;
    const a = await provider.generate(req({ params: { temperature: 0, seed } }));
    const b = await provider.generate(req({ params: { temperature: 0, seed, topP: 0.3, topK: 2 } }));
    // Greedy decoding always picks the highest-logit (anchor/template) word
    // regardless of truncation settings, so temp=0 output is identical with
    // or without topP/topK configured.
    expect(a.text).toBe(b.text);
  });

  it("higher temperature measurably lowers the average chosen-token probability (flatter distribution)", async () => {
    const seed = 123;
    const low = await drainStream(req({ params: { temperature: 0.2, seed, maxTokens: 20 } }));
    const high = await drainStream(req({ params: { temperature: 1.8, seed, maxTokens: 20 } }));
    expect(avgChosenProb(high.logprobs)).toBeLessThan(avgChosenProb(low.logprobs));
  });

  it("higher temperature produces different sampled text than temperature 0 (same seed)", async () => {
    const seed = 123;
    const greedy = await provider.generate(req({ params: { temperature: 0, seed } }));
    const sampled = await provider.generate(req({ params: { temperature: 1.8, seed } }));
    expect(sampled.text).not.toBe(greedy.text);
  });
});

describe("MockProvider topP / topK", () => {
  it("topK=1 collapses sampling to the greedy choice even at high temperature", async () => {
    const seed = 55;
    const greedy = await provider.generate(req({ params: { temperature: 0, seed } }));
    const topK1 = await provider.generate(req({ params: { temperature: 2, topK: 1, seed } }));
    expect(topK1.text).toBe(greedy.text);
  });

  it("a very small topP collapses sampling to the greedy choice even at high temperature", async () => {
    const seed = 55;
    const greedy = await provider.generate(req({ params: { temperature: 0, seed } }));
    const topP = await provider.generate(req({ params: { temperature: 2, topP: 0.0001, seed } }));
    expect(topP.text).toBe(greedy.text);
  });

  it("loosening topP vs a tight topP visibly changes which tokens get sampled", async () => {
    const seed = 55;
    const tight = await provider.generate(req({ params: { temperature: 1.5, topP: 0.05, seed } }));
    const loose = await provider.generate(req({ params: { temperature: 1.5, topP: 0.999, seed } }));
    expect(tight.text).not.toBe(loose.text);
  });
});

describe("MockProvider penalties / stop / maxTokens", () => {
  it("maxTokens caps output length and sets finishReason 'length'", async () => {
    const result = await provider.generate(req({ params: { maxTokens: 3, seed: 9 } }));
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(result.finishReason).toBe("length");
    const unlimited = await provider.generate(req({ params: { seed: 9 } }));
    expect(result.text.length).toBeLessThan(unlimited.text.length);
  });

  it("a stop sequence present in the template halts generation with finishReason 'stop'", async () => {
    // "context," appears early in template #0; stopping there yields a
    // measurably shorter output than the unconstrained generation.
    const seed = 123;
    const unconstrained = await provider.generate(req({ params: { temperature: 0, seed } }));
    const withStop = await provider.generate(
      req({ params: { temperature: 0, seed, stop: ["context,"] } }),
    );
    expect(withStop.finishReason).toBe("stop");
    expect(withStop.text.length).toBeLessThanOrEqual(unconstrained.text.length);
  });

  it("frequency penalty measurably changes output vs no penalty at the same temperature/seed", async () => {
    const seed = 321;
    const base = { temperature: 1.3, seed, maxTokens: 20 };
    const noPenalty = await provider.generate(req({ params: base }));
    const penalized = await provider.generate(req({ params: { ...base, frequencyPenalty: 2 } }));
    expect(penalized.text).not.toBe(noPenalty.text);
  });
});

describe("MockProvider embed", () => {
  it("is deterministic", async () => {
    const [a] = await provider.embed(["hello world"], "mock-small");
    const [b] = await provider.embed(["hello world"], "mock-small");
    expect(a).toEqual(b);
  });

  it("produces unit-normalized vectors", async () => {
    const [v] = await provider.embed(["retrieval augmented generation"], "mock-small");
    const norm = Math.sqrt(v!.reduce((acc, x) => acc + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("orders semantically overlapping text closer than unrelated text (cosine similarity)", async () => {
    const [a, b, c] = await provider.embed(
      [
        "retrieval augmented generation uses a vector database",
        "retrieval augmented generation uses an embedding index",
        "bananas are a good source of potassium",
      ],
      "mock-small",
    );
    const cosine = (x: number[], y: number[]) => x.reduce((acc, xi, i) => acc + xi * y[i]!, 0);
    expect(cosine(a!, b!)).toBeGreaterThan(cosine(a!, c!));
  });
});

describe("MockProvider cost math", () => {
  // Deliberately uses a NON-zero-rate catalog model (claude-sonnet-5:
  // $3/MTok in, $15/MTok out). estimateCost() is pure arithmetic over
  // MODEL_CATALOG rates regardless of which provider a model's catalog
  // entry names, so this exercises the real multiplication without making
  // any network call. A $0-rate model here would make `toBe(0)`
  // indistinguishable from a dropped/broken multiplication.
  it("uses MODEL_CATALOG rates via estimateCost: exact input/output cost = tokens x rate / 1e6", () => {
    const usage = { inputTokens: 2_000_000, outputTokens: 500_000, totalTokens: 2_500_000 };
    const cost = provider.estimateCost(usage, "claude-sonnet-5");
    expect(cost.inputCostUsd).toBe(6); // 2,000,000 / 1e6 * $3
    expect(cost.outputCostUsd).toBe(7.5); // 500,000 / 1e6 * $15
    expect(cost.totalCostUsd).toBe(13.5);
    expect(cost.totalCostUsd).toBe(cost.inputCostUsd + cost.outputCostUsd);
  });

  it("falls back to mock-small's ($0) rate for an unknown model id, not NaN/undefined", () => {
    const cost = provider.estimateCost({ inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 }, "not-a-real-model");
    expect(cost.inputCostUsd).toBe(0);
    expect(cost.outputCostUsd).toBe(0);
    expect(cost.totalCostUsd).toBe(0);
  });
});

describe("MockProvider tool calls", () => {
  it("deterministically calls a provided tool when toolChoice !== 'none'", async () => {
    const r = req({
      tools: [{ name: "calculator", description: "adds numbers", inputSchema: {}, category: "math" }],
      params: { seed: 1 },
    });
    const result = await provider.generate(r);
    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCalls?.[0]?.name).toBe("calculator");
  });
});
