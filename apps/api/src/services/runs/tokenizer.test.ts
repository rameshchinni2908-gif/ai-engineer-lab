import { describe, expect, it } from "vitest";
import { approxTokenize, countApproxTokens } from "./tokenizer.js";

describe("approxTokenize / countApproxTokens", () => {
  it("is deterministic for the same text", () => {
    const text = "Retrieval augmented generation, briefly explained!";
    expect(approxTokenize(text)).toEqual(approxTokenize(text));
    expect(countApproxTokens(text)).toBe(countApproxTokens(text));
  });

  it("splits long words into ~4-character subchunks", () => {
    const tokens = approxTokenize("internationalization");
    expect(tokens.length).toBeGreaterThan(1);
    for (const t of tokens) expect(t.text.length).toBeLessThanOrEqual(4);
  });

  it("keeps punctuation as separate tokens", () => {
    const tokens = approxTokenize("hi, there.");
    expect(tokens.some((t) => t.text === ",")).toBe(true);
    expect(tokens.some((t) => t.text === ".")).toBe(true);
  });

  it("longer text yields a higher token count than shorter text", () => {
    const short = countApproxTokens("hello");
    const long = countApproxTokens("hello this is a much longer sentence with many more words");
    expect(long).toBeGreaterThan(short);
  });

  it("empty string has zero tokens", () => {
    expect(countApproxTokens("")).toBe(0);
  });
});
