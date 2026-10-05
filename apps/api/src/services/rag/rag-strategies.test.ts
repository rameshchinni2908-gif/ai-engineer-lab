import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-rag-strategies.db");
process.env.VECTOR_STORE = "memory";

const { retrieve } = await import("./retrieval.js");
const { runFailureModeDemo } = await import("./failure-modes.js");
const { getVectorStore, _resetVectorStoreForTests } = await import("../../stores/vector/registry.js");
const { replaceChunks } = await import("../../stores/rag/documents.js");
const { closeDb } = await import("../../db/index.js");
const { MockProvider } = await import("../../providers/mock.js");

const collection = "rag-strategies-test";
const texts = [
  "The return policy allows refunds within thirty days of purchase.",
  "Perishable goods are not eligible for any returns or refunds.",
  "Customer support can be reached by email at support@example.com.",
  "Shipping typically takes three to five business days domestically.",
  "International orders may take up to three weeks to arrive.",
  "Shipping internationally can be slow and unpredictable. Packages sometimes get held at customs for inspection. Most international orders still arrive within three weeks of dispatch. Delays beyond that window are rare but possible for remote regions.",
];

beforeAll(async () => {
  _resetVectorStoreForTests();
  const store = await getVectorStore();
  await store.createCollection(collection, 64, { distance: "cosine" });
  const mock = new MockProvider();
  const vectors = await mock.embed(texts, "mock-small");
  // texts[0..2] belong to "rs-doc-0" (doc-local indices 0,1,2), texts[3..5]
  // belong to "rs-doc-1" (doc-local indices 0,1,2) - contiguous per-document
  // indices so expandToParentContext's index-1/index+1 neighbour lookup has
  // real siblings to find, matching how the real ingestion pipeline chunks
  // one document's text into a single contiguous, per-document index space.
  const documentIds = texts.map((_, i) => (i < 3 ? "rs-doc-0" : "rs-doc-1"));
  const localIndex = texts.map((_, i) => (i < 3 ? i : i - 3));
  await store.upsert(
    collection,
    texts.map((text, i) => ({
      id: `rs-chunk-${i}`,
      vector: vectors[i]!,
      metadata: { text, chunkId: `rs-chunk-${i}`, documentId: documentIds[i], index: localIndex[i] },
    })),
  );
  // expandToParentContext (parent-doc strategy) reads sibling chunks from the
  // SQLite `chunks` table (populated by the real ingestion pipeline), not
  // from the vector store - seed matching rows so the unit test below
  // exercises that neighbour-lookup path for real.
  for (const docId of new Set(documentIds)) {
    const docChunks = texts
      .map((text, i) => ({ text, i }))
      .filter(({ i }) => documentIds[i] === docId)
      .map(({ text, i }) => ({
        id: `rs-chunk-${i}`,
        documentId: docId,
        index: localIndex[i]!,
        text,
        startOffset: 0,
        endOffset: text.length,
        tokenCount: text.split(/\s+/).length,
        metadata: {},
      }));
    await replaceChunks(docId, docChunks);
  }
});

afterAll(() => {
  closeDb();
  _resetVectorStoreForTests();
});

describe("retrieve() strategies", () => {
  it("basic strategy returns vector-sourced results with a 'retrieve' stage", async () => {
    const { results, debug } = await retrieve({
      query: "refund policy",
      collection,
      topK: 3,
      providerId: "mock",
      model: "mock-small",
      strategy: "basic",
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.source === "vector")).toBe(true);
    expect(debug.stages.map((s) => s.stage)).toEqual(["retrieve"]);
    expect(debug.rewrittenQueries).toEqual([]);
  });

  it("query-rewrite strategy emits a rewrite stage and a rewritten query", async () => {
    const { debug } = await retrieve({
      query: "what about the second one?",
      collection,
      topK: 3,
      providerId: "mock",
      model: "mock-small",
      strategy: "query-rewrite",
    });
    expect(debug.stages.map((s) => s.stage)).toEqual(["rewrite", "retrieve"]);
    expect(debug.rewrittenQueries).toHaveLength(1);
  });

  it("hyde strategy generates a hypothetical answer before retrieving", async () => {
    const { debug } = await retrieve({
      query: "refund",
      collection,
      topK: 3,
      providerId: "mock",
      model: "mock-small",
      strategy: "hyde",
    });
    expect(debug.stages[0]!.stage).toBe("rewrite");
    expect(debug.rewrittenQueries).toHaveLength(1);
  });

  it("multi-query strategy fuses several variant retrievals via RRF", async () => {
    const { results, debug } = await retrieve({
      query: "refund",
      collection,
      topK: 3,
      providerId: "mock",
      model: "mock-small",
      strategy: "multi-query",
    });
    expect(debug.rewrittenQueries).toHaveLength(3);
    expect(results.every((r) => r.source === "vector")).toBe(true);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("parent-doc strategy expands each result's text with neighbouring chunk context", async () => {
    const { results } = await retrieve({
      query: "returns",
      collection,
      topK: 2,
      providerId: "mock",
      model: "mock-small",
      strategy: "parent-doc",
    });
    expect(results.some((r) => r.metadata.parentExpanded === true)).toBe(true);
  });

  it("compression strategy shortens a multi-sentence retrieved chunk relative to the original", async () => {
    const { results } = await retrieve({
      query: "international shipping customs delays",
      collection,
      topK: texts.length,
      providerId: "mock",
      model: "mock-small",
      strategy: "compression",
    });
    const multiSentenceResult = results.find((r) => r.chunkId === "rs-chunk-5");
    expect(multiSentenceResult).toBeDefined();
    expect(multiSentenceResult!.metadata.compressedToChars).toBeDefined();
    expect(multiSentenceResult!.metadata.compressedToChars as number).toBeLessThan(
      multiSentenceResult!.metadata.compressedFromChars as number,
    );
  });

  it("agentic strategy runs at least one bounded retrieval round and stops within the cap", async () => {
    const { debug, results } = await retrieve({
      query: "shipping",
      collection,
      topK: 2,
      providerId: "mock",
      model: "mock-small",
      strategy: "agentic",
    });
    const roundStages = debug.stages.filter((s) => s.stage.startsWith("agentic.round."));
    expect(roundStages.length).toBeGreaterThanOrEqual(1);
    expect(roundStages.length).toBeLessThanOrEqual(3);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("runFailureModeDemo", () => {
  it("'miss' mode reports a diagnosis and a run even when relevance is thresholded away", async () => {
    const result = await runFailureModeDemo({ mode: "miss", query: "refund policy", collection });
    expect(result.diagnosis.length).toBeGreaterThan(0);
    expect(result.fix.length).toBeGreaterThan(0);
    expect(result.run.status).toBe("complete");
  });

  it("'ignored' mode's diagnosis cites the real retrieved chunk count", async () => {
    const result = await runFailureModeDemo({ mode: "ignored", query: "refund policy", collection });
    expect(result.diagnosis).toMatch(/chunk/i);
    expect(result.retrievalDebug.stages.length).toBeGreaterThan(0);
  });

  it("'lost-in-middle' mode places the best-scoring chunk away from the front of the context", async () => {
    const result = await runFailureModeDemo({ mode: "lost-in-middle", query: "shipping time", collection });
    expect(result.diagnosis).toMatch(/position/i);
  });

  it("'stale' mode's diagnosis references the index/re-embed relationship", async () => {
    const result = await runFailureModeDemo({ mode: "stale", query: "support email", collection });
    expect(result.diagnosis.length).toBeGreaterThan(0);
    expect(result.fix).toMatch(/re-chunk|re-embed|re-index/i);
  });
});
