import { describe, expect, it } from "vitest";
import { computeAttentionHeatmap } from "./attention-heatmap.js";

describe("computeAttentionHeatmap", () => {
  it("returns one row/column per non-whitespace token and discloses the illustrative note", () => {
    const result = computeAttentionHeatmap({ text: "the cat sat" });
    expect(result.attention).toHaveLength(result.tokens.length);
    for (const row of result.attention) {
      expect(row).toHaveLength(result.tokens.length);
    }
    expect(result.note).toContain("Simulated");
  });

  it("each row sums to approximately 1 (normalized distribution)", () => {
    const result = computeAttentionHeatmap({ text: "hello world example text" });
    for (const row of result.attention) {
      const sum = row.reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it("is deterministic for the same input text", () => {
    const a = computeAttentionHeatmap({ text: "repeat this text" });
    const b = computeAttentionHeatmap({ text: "repeat this text" });
    expect(a).toEqual(b);
  });

  it("gives a token higher self-attention-like weight to itself than to an unrelated token", () => {
    // Short (<=4 char) words to avoid the approximate tokenizer's subchunking,
    // so each word is its own single token.
    const result = computeAttentionHeatmap({ text: "cat dog cat" });
    const tokenIndex = result.tokens.findIndex((t) => t.toLowerCase() === "cat");
    const unrelatedIndex = result.tokens.findIndex((t) => t.toLowerCase() === "dog");
    expect(result.attention[tokenIndex]![tokenIndex]!).toBeGreaterThan(
      result.attention[tokenIndex]![unrelatedIndex]!,
    );
  });
});
