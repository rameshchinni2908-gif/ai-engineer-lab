import { describe, expect, it } from "vitest";
import { bm25Search } from "./bm25.js";

const corpus = [
  { id: "d1", text: "The quick brown fox jumps over the lazy dog" },
  { id: "d2", text: "Product code SKU-48213 is out of stock" },
  { id: "d3", text: "A fox and a dog became unlikely friends in the forest" },
  { id: "d4", text: "Completely unrelated text about quarterly financial results" },
];

describe("bm25Search", () => {
  it("ranks documents containing the exact query term above those that don't", () => {
    const results = bm25Search("fox", corpus);
    const ids = results.filter((r) => r.score > 0).map((r) => r.id);
    expect(ids).toContain("d1");
    expect(ids).toContain("d3");
    expect(ids).not.toContain("d4");
  });

  it("scores an exact rare-term match (e.g. a product code) highly - BM25's strength over dense vectors", () => {
    const results = bm25Search("SKU-48213", corpus);
    expect(results[0]!.id).toBe("d2");
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it("returns every document (zero-scored if no overlap) rather than dropping non-matches", () => {
    const results = bm25Search("fox", corpus);
    expect(results).toHaveLength(corpus.length);
  });

  it("is deterministic for identical input", () => {
    const a = bm25Search("fox dog", corpus);
    const b = bm25Search("fox dog", corpus);
    expect(a).toEqual(b);
  });

  it("returns all docs scored 0 for an empty query", () => {
    const results = bm25Search("", corpus);
    expect(results.every((r) => r.score === 0)).toBe(true);
  });

  it("handles an empty corpus without throwing", () => {
    expect(bm25Search("fox", [])).toEqual([]);
  });

  it("gives a document mentioning the query term twice a higher score than one mentioning it once (holding length constant)", () => {
    const docs = [
      { id: "once", text: "dog walks in the park near the river" },
      { id: "twice", text: "dog meets another dog in the park near" },
    ];
    const results = bm25Search("dog", docs);
    const score = (id: string) => results.find((r) => r.id === id)!.score;
    expect(score("twice")).toBeGreaterThan(score("once"));
  });
});
