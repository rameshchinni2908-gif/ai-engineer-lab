import { describe, expect, it } from "vitest";
import { combineSeed, hashString, mulberry32 } from "./prng.js";

describe("hashString", () => {
  it("is deterministic", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
  });

  it("differs for different inputs", () => {
    expect(hashString("hello")).not.toBe(hashString("world"));
  });
});

describe("combineSeed", () => {
  it("is deterministic for the same base + extras", () => {
    expect(combineSeed(1, "a", { x: 1 })).toBe(combineSeed(1, "a", { x: 1 }));
  });

  it("differs when extras differ", () => {
    expect(combineSeed(1, "a", { x: 1 })).not.toBe(combineSeed(1, "a", { x: 2 }));
  });
});

describe("mulberry32", () => {
  it("produces a deterministic sequence for a given seed", () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
