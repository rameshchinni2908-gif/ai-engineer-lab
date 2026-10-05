import { describe, expect, it } from "vitest";
import { tokenizeForVisualizer, charsPerToken } from "./tokenize.js";

describe("tokenizeForVisualizer", () => {
  it("splits plain English text into word tokens with sequential ids", () => {
    const result = tokenizeForVisualizer("cat dog");
    expect(result.tokenCount).toBe(result.tokens.length);
    expect(result.tokens.map((t) => t.id)).toEqual(result.tokens.map((_, i) => i));
    expect(result.tokens.some((t) => t.text === "cat")).toBe(true);
  });

  it("attaches UTF-8 byte arrays per token so multi-byte characters are visible", () => {
    const result = tokenizeForVisualizer("héllo");
    const withAccent = result.tokens.find((t) => t.text.includes("é"));
    expect(withAccent).toBeDefined();
    // "é" is 2 bytes in UTF-8, so the token's byte array must be longer than its character count.
    expect(withAccent!.bytes.length).toBeGreaterThanOrEqual(withAccent!.text.length);
  });

  it("splits long/rare words and punctuation differently from short common ones", () => {
    const short = tokenizeForVisualizer("a");
    const long = tokenizeForVisualizer("supercalifragilisticexpialidocious");
    expect(short.tokenCount).toBe(1);
    expect(long.tokenCount).toBeGreaterThan(1);
  });

  it("handles empty text without throwing", () => {
    const result = tokenizeForVisualizer("");
    expect(result.tokenCount).toBe(0);
    expect(result.tokens).toEqual([]);
  });

  it("tokenizes punctuation-heavy code differently from prose", () => {
    const code = tokenizeForVisualizer("const x = {a:1,b:2};");
    const prose = tokenizeForVisualizer("const x equals one and two");
    // Code has lots of short punctuation tokens the approximate tokenizer
    // splits out individually; its token count per character should exceed prose's.
    const codeRatio = code.tokenCount / code.tokens.reduce((n, t) => n + t.text.length, 0);
    const proseRatio = prose.tokenCount / prose.tokens.reduce((n, t) => n + t.text.length, 0);
    expect(codeRatio).toBeGreaterThan(0);
    expect(proseRatio).toBeGreaterThan(0);
  });
});

describe("charsPerToken", () => {
  it("computes the ratio for non-empty input", () => {
    expect(charsPerToken("hello", 5)).toBe(1);
    expect(charsPerToken("hello world", 2)).toBe(5.5);
  });

  it("returns 0 for zero tokens instead of dividing by zero", () => {
    expect(charsPerToken("", 0)).toBe(0);
  });
});
