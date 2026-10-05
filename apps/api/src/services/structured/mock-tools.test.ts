import { describe, expect, it } from "vitest";
import { evaluateArithmetic, MOCK_TOOLS } from "./mock-tools.js";

describe("evaluateArithmetic", () => {
  it("evaluates simple addition and multiplication with correct precedence", () => {
    expect(evaluateArithmetic("2 + 3 * 4")).toBe(14);
  });

  it("respects parentheses", () => {
    expect(evaluateArithmetic("(2 + 3) * 4")).toBe(20);
  });

  it("handles negative numbers", () => {
    expect(evaluateArithmetic("-5 + 10")).toBe(5);
  });

  it("handles division", () => {
    expect(evaluateArithmetic("10 / 2")).toBe(5);
  });

  it("throws on an empty expression", () => {
    expect(() => evaluateArithmetic("")).toThrow();
  });

  it("throws on a malformed expression", () => {
    expect(() => evaluateArithmetic("2 + )")).toThrow();
  });
});

describe("MOCK_TOOLS registry", () => {
  it("calculator tool evaluates an expression argument", () => {
    expect(MOCK_TOOLS.calculator!.execute({ expr: "3 + 4" })).toBe("7");
  });

  it("word_count tool counts words correctly, including the empty-string edge case", () => {
    expect(MOCK_TOOLS.word_count!.execute({ text: "the quick brown fox" })).toBe("4");
    expect(MOCK_TOOLS.word_count!.execute({ text: "" })).toBe("0");
  });

  it("reverse_text tool reverses a string", () => {
    expect(MOCK_TOOLS.reverse_text!.execute({ text: "abc" })).toBe("cba");
  });

  it("mock_clock tool returns a fixed deterministic timestamp, not the real system time", () => {
    const first = MOCK_TOOLS.mock_clock!.execute({});
    const second = MOCK_TOOLS.mock_clock!.execute({});
    expect(first).toBe(second);
  });
});
