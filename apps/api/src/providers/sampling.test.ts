import { describe, expect, it } from "vitest";
import { mulberry32 } from "./prng.js";
import {
  normalizedEntropy,
  sampleCandidate,
  scaleLogits,
  softmax,
  truncate,
  type Candidate,
} from "./sampling.js";

describe("softmax", () => {
  it("sums to 1 and preserves ordering", () => {
    const probs = softmax([3, 1, 0.5]);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(probs[0]).toBeGreaterThan(probs[1]!);
    expect(probs[1]).toBeGreaterThan(probs[2]!);
  });
});

describe("scaleLogits", () => {
  const candidates: Candidate[] = [
    { token: "a", baseLogit: 3 },
    { token: "b", baseLogit: 1 },
  ];

  it("higher temperature flattens the resulting distribution (higher entropy)", () => {
    const counts = new Map<string, number>();
    const lowTemp = softmax(scaleLogits(candidates, { temperature: 0.2 }, counts));
    const highTemp = softmax(scaleLogits(candidates, { temperature: 2 }, counts));
    expect(normalizedEntropy(highTemp)).toBeGreaterThan(normalizedEntropy(lowTemp));
  });

  it("presence penalty reduces the logit of an already-used token", () => {
    const counts = new Map<string, number>([["a", 1]]);
    const noPenalty = scaleLogits(candidates, { temperature: 1 }, new Map());
    const withPenalty = scaleLogits(candidates, { temperature: 1, presencePenalty: 1 }, counts);
    expect(withPenalty[0]).toBeLessThan(noPenalty[0]!);
  });

  it("frequency penalty scales with repeat count", () => {
    const counts1 = new Map([["a", 1]]);
    const counts3 = new Map([["a", 3]]);
    const logit1 = scaleLogits(candidates, { temperature: 1, frequencyPenalty: 0.5 }, counts1)[0]!;
    const logit3 = scaleLogits(candidates, { temperature: 1, frequencyPenalty: 0.5 }, counts3)[0]!;
    expect(logit3).toBeLessThan(logit1);
  });
});

describe("truncate", () => {
  it("topK keeps only the k highest-probability indices", () => {
    const kept = truncate([0.4, 0.3, 0.2, 0.1], undefined, 2);
    expect(kept).toEqual([0, 1]);
  });

  it("topP keeps the smallest nucleus whose cumulative probability >= p", () => {
    const kept = truncate([0.5, 0.3, 0.15, 0.05], 0.7, undefined);
    expect(kept).toEqual([0, 1]);
  });

  it("always keeps at least one index", () => {
    const kept = truncate([0.9, 0.1], 0.0001, undefined);
    expect(kept.length).toBeGreaterThanOrEqual(1);
  });
});

describe("sampleCandidate", () => {
  const candidates: Candidate[] = [
    { token: "greedy", baseLogit: 3 },
    { token: "alt1", baseLogit: 1 },
    { token: "alt2", baseLogit: 0.5 },
  ];

  it("temperature<=~0 is greedy/deterministic regardless of RNG", () => {
    const rngA = mulberry32(1);
    const rngB = mulberry32(999999);
    const a = sampleCandidate(candidates, { temperature: 0 }, new Map(), rngA);
    const b = sampleCandidate(candidates, { temperature: 0 }, new Map(), rngB);
    expect(a.index).toBe(0);
    expect(b.index).toBe(0);
  });

  it("logprob reflects the FULL pre-truncation softmax distribution", () => {
    const rng = mulberry32(42);
    const { logprob } = sampleCandidate(candidates, { temperature: 1, topK: 1 }, new Map(), rng);
    // Even though topK=1 truncates sampling to the greedy candidate, the
    // reported logprob must still be < 0 (i.e. not probability 1), proving
    // it was computed pre-truncation.
    expect(logprob.logprob).toBeLessThan(0);
    expect(logprob.topAlternatives.length).toBeGreaterThan(0);
  });

  it("same seed + same params ⇒ identical sampled index (determinism)", () => {
    const results = Array.from({ length: 5 }, () =>
      sampleCandidate(candidates, { temperature: 1.5 }, new Map(), mulberry32(7)),
    );
    const indices = results.map((r) => r.index);
    expect(new Set(indices).size).toBe(1);
  });
});
