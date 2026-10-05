import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-hybrid.db");
process.env.VECTOR_STORE = "memory";

const { hybridSearch } = await import("./hybrid.js");
const { getVectorStore, _resetVectorStoreForTests } = await import("../../stores/vector/registry.js");
const { closeDb } = await import("../../db/index.js");

describe("hybridSearch (BM25 + vector, fused via RRF)", () => {
  const collection = "hybrid-test-collection";

  beforeAll(async () => {
    _resetVectorStoreForTests();
    const store = await getVectorStore();
    await store.createCollection(collection, 64, { distance: "cosine" });
    const { MockProvider } = await import("../../providers/mock.js");
    const mock = new MockProvider();
    const texts = [
      "The quarterly report covers revenue growth across all regions.",
      "Product code SKU-48213 was restocked this week after a shortage.",
      "Our return policy allows refunds within thirty days of purchase.",
      "SKU-48213 pricing was updated following the restock.",
    ];
    const vectors = await mock.embed(texts, "mock-small");
    await store.upsert(
      collection,
      texts.map((text, i) => ({
        id: `chunk-${i}`,
        vector: vectors[i]!,
        metadata: { text, chunkId: `chunk-${i}`, documentId: "doc-1" },
      })),
    );
  });

  afterAll(async () => {
    closeDb();
    _resetVectorStoreForTests();
  });

  it("surfaces an exact rare-term match (BM25's strength) even if vector similarity alone might rank it lower", async () => {
    const { results, debug } = await hybridSearch({
      collection,
      query: "SKU-48213",
      topK: 3,
      providerId: "mock",
      model: "mock-small",
    });
    expect(results.length).toBeGreaterThan(0);
    const bm25Stage = debug.stages.find((s) => s.stage === "bm25")!;
    expect(bm25Stage.candidates.some((c) => c.text.includes("SKU-48213"))).toBe(true);
  });

  it("produces one debug stage each for bm25, vector, and fusion", async () => {
    const { debug } = await hybridSearch({
      collection,
      query: "revenue growth",
      topK: 3,
      providerId: "mock",
      model: "mock-small",
    });
    expect(debug.stages.map((s) => s.stage).sort()).toEqual(["bm25", "fusion", "vector"]);
    expect(debug.totalTimingMs).toBeGreaterThanOrEqual(0);
  });

  it("fused results respect the requested topK", async () => {
    const { results } = await hybridSearch({
      collection,
      query: "refund policy",
      topK: 2,
      providerId: "mock",
      model: "mock-small",
    });
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
