import { describe, expect, it } from "vitest";
import { InMemoryVectorStore } from "./in-memory.js";

describe("namespace / multi-tenancy isolation", () => {
  it("a search scoped to tenant A's namespace never returns tenant B's points, even for an identical query vector", async () => {
    const store = new InMemoryVectorStore();
    const collection = "multi-tenant-demo";
    await store.createCollection(collection, 2, { distance: "cosine" });

    await store.upsert(collection, [
      { id: "a1", vector: [1, 0], metadata: { text: "tenant A secret doc" }, namespace: "tenantA" },
      { id: "a2", vector: [0.9, 0.1], metadata: { text: "tenant A other doc" }, namespace: "tenantA" },
      { id: "b1", vector: [1, 0], metadata: { text: "tenant B secret doc" }, namespace: "tenantB" },
      { id: "b2", vector: [0.95, 0.05], metadata: { text: "tenant B other doc" }, namespace: "tenantB" },
    ]);

    const asTenantA = await store.search(collection, [1, 0], { topK: 10, namespace: "tenantA" });
    expect(asTenantA.map((h) => h.id).sort()).toEqual(["a1", "a2"]);
    expect(asTenantA.some((h) => h.id.startsWith("b"))).toBe(false);

    const asTenantB = await store.search(collection, [1, 0], { topK: 10, namespace: "tenantB" });
    expect(asTenantB.map((h) => h.id).sort()).toEqual(["b1", "b2"]);
    expect(asTenantB.some((h) => h.id.startsWith("a"))).toBe(false);
  });

  it("an unscoped search (no namespace given) sees every tenant's points", async () => {
    const store = new InMemoryVectorStore();
    const collection = "multi-tenant-unscoped";
    await store.createCollection(collection, 2, { distance: "cosine" });
    await store.upsert(collection, [
      { id: "a1", vector: [1, 0], metadata: {}, namespace: "tenantA" },
      { id: "b1", vector: [1, 0], metadata: {}, namespace: "tenantB" },
    ]);
    const hits = await store.search(collection, [1, 0], { topK: 10 });
    expect(hits.map((h) => h.id).sort()).toEqual(["a1", "b1"]);
  });

  it("delete scoped by id only removes that tenant's point, not a same-id point in another namespace with a different point id", async () => {
    const store = new InMemoryVectorStore();
    const collection = "multi-tenant-delete";
    await store.createCollection(collection, 2);
    await store.upsert(collection, [
      { id: "tenantA::doc1", vector: [1, 0], metadata: {}, namespace: "tenantA" },
      { id: "tenantB::doc1", vector: [1, 0], metadata: {}, namespace: "tenantB" },
    ]);
    await store.delete(collection, ["tenantA::doc1"]);
    expect(await store.count(collection)).toBe(1);
    const remaining = await store.get(collection, ["tenantB::doc1"]);
    expect(remaining).toHaveLength(1);
  });
});
