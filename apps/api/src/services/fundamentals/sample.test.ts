import { describe, expect, it } from "vitest";
import { buildSampleParamsList } from "./sample.js";

describe("buildSampleParamsList", () => {
  it("returns exactly n entries", () => {
    const list = buildSampleParamsList({ temperature: 0.8 }, 5);
    expect(list).toHaveLength(5);
  });

  it("assigns a distinct seed per sample so n>1 samples actually diverge in Mock mode", () => {
    const list = buildSampleParamsList({ temperature: 0.8 }, 4);
    const seeds = list.map((p) => p.seed);
    expect(new Set(seeds).size).toBe(4);
  });

  it("offsets from the user-supplied seed when one is given, for reproducibility", () => {
    const list = buildSampleParamsList({ temperature: 0.8, seed: 42 }, 3);
    expect(list.map((p) => p.seed)).toEqual([42, 43, 44]);
  });

  it("defaults to a single sample when n is omitted or non-positive", () => {
    expect(buildSampleParamsList({}, 0)).toHaveLength(1);
    expect(buildSampleParamsList({}, -3)).toHaveLength(1);
  });

  it("preserves all other params unchanged on every sample", () => {
    const list = buildSampleParamsList({ temperature: 0.5, topP: 0.9, maxTokens: 40 }, 2);
    for (const p of list) {
      expect(p.temperature).toBe(0.5);
      expect(p.topP).toBe(0.9);
      expect(p.maxTokens).toBe(40);
    }
  });
});
