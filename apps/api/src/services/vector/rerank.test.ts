import { describe, expect, it } from "vitest";
import type { RetrievalResult } from "@ail/shared";
import { mockRerankScore, rerankCandidates } from "./rerank.js";

function result(chunkId: string, text: string, score: number, rank: number): RetrievalResult {
  return { chunkId, text, score, rank, source: "vector", documentId: "doc1", metadata: {} };
}

describe("mockRerankScore", () => {
  it("is deterministic for the same (query, candidate) pair", () => {
    const a = mockRerankScore("what is BM25", "BM25 is a lexical ranking function");
    const b = mockRerankScore("what is BM25", "BM25 is a lexical ranking function");
    expect(a).toBe(b);
  });

  it("stays within [0, 1]", () => {
    for (const [q, c] of [
      ["hello", "world"],
      ["", ""],
      ["a very long query ".repeat(20), "a very long candidate ".repeat(20)],
    ] as const) {
      const score = mockRerankScore(q, c);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("rewards lexical overlap between query and candidate", () => {
    const overlapping = mockRerankScore("bm25 ranking function", "bm25 ranking function explained in depth");
    const unrelated = mockRerankScore("bm25 ranking function", "completely unrelated text about gardening");
    expect(overlapping).toBeGreaterThan(unrelated);
  });
});

describe("rerankCandidates", () => {
  it("can reorder candidates relative to the input (cheap-retriever) order", () => {
    const candidates: RetrievalResult[] = [
      result("c1", "totally irrelevant filler content about weather", 0.9, 0),
      result("c2", "bm25 ranking function explained", 0.5, 1),
    ];
    const { before, after } = rerankCandidates("bm25 ranking function", candidates);
    expect(before.map((r) => r.chunkId)).toEqual(["c1", "c2"]);
    expect(after[0]!.chunkId).toBe("c2"); // the lexically-matching one should win after rerank
    expect(after.every((r) => r.source === "rerank")).toBe(true);
  });

  it("assigns fresh sequential ranks to the 'after' ordering", () => {
    const candidates: RetrievalResult[] = [result("c1", "a", 0.1, 0), result("c2", "b", 0.2, 1)];
    const { after } = rerankCandidates("query", candidates);
    expect(after.map((r) => r.rank)).toEqual([0, 1]);
  });

  it("does not mutate the original candidates array", () => {
    const candidates: RetrievalResult[] = [result("c1", "a", 0.1, 0)];
    const snapshot = JSON.parse(JSON.stringify(candidates));
    rerankCandidates("query", candidates);
    expect(candidates).toEqual(snapshot);
  });
});
