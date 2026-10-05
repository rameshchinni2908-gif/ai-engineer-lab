import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-vector-routes.db");
process.env.RATE_LIMIT_MAX = "1000";
process.env.RATE_LIMIT_WINDOW_MS = "60000";
process.env.VECTOR_STORE = "memory";

const { buildApp } = await import("../../app.js");
const { closeDb } = await import("../../db/index.js");
const { _resetVectorStoreForTests } = await import("../../stores/vector/registry.js");

describe("vector routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    _resetVectorStoreForTests();
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  it("full collection lifecycle: create, upsert, search, delete, count", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/vector/collections",
      payload: { name: "route-test-collection", dim: 3, opts: { distance: "cosine" } },
    });
    expect(create.statusCode).toBe(201);

    const list = await app.inject({ method: "GET", url: "/api/vector/collections" });
    expect(list.json().collections).toContain("route-test-collection");

    const upsert = await app.inject({
      method: "POST",
      url: "/api/vector/collections/route-test-collection/upsert",
      payload: {
        points: [
          { id: "p1", vector: [1, 0, 0], metadata: { text: "alpha" } },
          { id: "p2", vector: [0, 1, 0], metadata: { text: "beta" } },
        ],
      },
    });
    expect(upsert.statusCode).toBe(200);
    expect(upsert.json().upserted).toBe(2);

    const count = await app.inject({ method: "GET", url: "/api/vector/collections/route-test-collection/count" });
    expect(count.json().count).toBe(2);

    const search = await app.inject({
      method: "POST",
      url: "/api/vector/collections/route-test-collection/search",
      payload: { vector: [1, 0, 0], topK: 1 },
    });
    expect(search.json().hits[0].id).toBe("p1");

    const del = await app.inject({
      method: "POST",
      url: "/api/vector/collections/route-test-collection/delete",
      payload: { ids: ["p1"] },
    });
    expect(del.json().deleted).toBe(1);

    const countAfter = await app.inject({ method: "GET", url: "/api/vector/collections/route-test-collection/count" });
    expect(countAfter.json().count).toBe(1);

    const cleanup = await app.inject({ method: "DELETE", url: "/api/vector/collections/route-test-collection" });
    expect(cleanup.statusCode).toBe(200);
  });

  it("POST /api/vector/collections returns 409 for a duplicate name", async () => {
    await app.inject({ method: "POST", url: "/api/vector/collections", payload: { name: "dup-test", dim: 2 } });
    const res = await app.inject({ method: "POST", url: "/api/vector/collections", payload: { name: "dup-test", dim: 2 } });
    expect(res.statusCode).toBe(409);
    await app.inject({ method: "DELETE", url: "/api/vector/collections/dup-test" });
  });

  it("POST /api/vector/hybrid-search returns fused results with staged debug", async () => {
    await app.inject({ method: "POST", url: "/api/vector/collections", payload: { name: "hybrid-route-test", dim: 64 } });
    const embedRes = await app.inject({
      method: "POST",
      url: "/api/embeddings/embed",
      payload: { texts: ["the dog ran in the park", "cats like to nap"], providerId: "mock", model: "mock-small" },
    });
    const { embeddings } = embedRes.json();
    await app.inject({
      method: "POST",
      url: "/api/vector/collections/hybrid-route-test/upsert",
      payload: {
        points: [
          { id: "h1", vector: embeddings[0], metadata: { text: "the dog ran in the park", chunkId: "h1", documentId: "d1" } },
          { id: "h2", vector: embeddings[1], metadata: { text: "cats like to nap", chunkId: "h2", documentId: "d1" } },
        ],
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/vector/hybrid-search",
      payload: { collection: "hybrid-route-test", query: "dog park", topK: 2, providerId: "mock", model: "mock-small" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.debug.stages.map((s: { stage: string }) => s.stage).sort()).toEqual(["bm25", "fusion", "vector"]);
    expect(body.results.length).toBeGreaterThan(0);

    await app.inject({ method: "DELETE", url: "/api/vector/collections/hybrid-route-test" });
  });

  it("POST /api/vector/rerank returns before/after orderings with source='rerank' on after", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/vector/rerank",
      payload: {
        query: "bm25 ranking",
        candidates: [
          { chunkId: "c1", text: "unrelated filler text", score: 0.9, rank: 0, source: "vector", documentId: "d1", metadata: {} },
          { chunkId: "c2", text: "bm25 ranking explained in detail", score: 0.3, rank: 1, source: "vector", documentId: "d1", metadata: {} },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.after[0].chunkId).toBe("c2");
    expect(body.after.every((r: { source: string }) => r.source === "rerank")).toBe(true);
  });
});
