import { describe, expect, it } from "vitest";
import { runVectorSearch } from "./vector-search.js";

describe("vector_search tool", () => {
  it("falls back to the local mock corpus when the retrieval module isn't reachable, and says so", async () => {
    const outcome = await runVectorSearch({ query: "chunking strategy for RAG" });
    expect(outcome.isError).toBe(false);
    const parsed = JSON.parse(outcome.content) as { source: string; hits: { id: string; score: number }[] };
    expect(parsed.source).toBe("local-mock");
    expect(parsed.hits.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same query", async () => {
    const a = await runVectorSearch({ query: "reranking" });
    const b = await runVectorSearch({ query: "reranking" });
    expect(a.content).toBe(b.content);
  });

  it("rejects a missing query argument", async () => {
    const outcome = await runVectorSearch({});
    expect(outcome.isError).toBe(true);
  });
});
