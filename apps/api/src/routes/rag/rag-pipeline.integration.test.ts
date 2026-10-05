import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-rag-pipeline.db");
process.env.RATE_LIMIT_MAX = "2000";
process.env.RATE_LIMIT_WINDOW_MS = "60000";
process.env.VECTOR_STORE = "memory";
process.env.LLM_PROVIDER = "mock";

const { buildApp } = await import("../../app.js");
const { closeDb } = await import("../../db/index.js");
const { _resetVectorStoreForTests } = await import("../../stores/vector/registry.js");

/**
 * Full RAG pipeline integration test, in Mock mode, with zero API keys and
 * no Docker/Qdrant running: upload -> parse -> chunk -> embed -> store ->
 * retrieve -> generate WITH citations, via the real HTTP routes end to end.
 * Required by the task brief and by Wave 3's QA gate.
 */
describe("RAG pipeline integration (Mock mode, zero keys, InMemoryStore)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    _resetVectorStoreForTests();
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  const collection = "rag-pipeline-integration";
  const documentText = [
    "# Returns Policy",
    "",
    "Our return policy allows refunds within thirty days of purchase for unopened items.",
    "",
    "## Exceptions",
    "",
    "Perishable goods and custom orders are not eligible for returns under any circumstances.",
    "",
    "## Contact",
    "",
    "Reach the support team at support@example.com for any return questions.",
  ].join("\n");

  it("ingests a markdown document end to end: upload -> parse -> chunk -> embed -> index", async () => {
    const upload = await app.inject({
      method: "POST",
      url: "/api/rag/documents",
      payload: { name: "returns-policy.md", mimeType: "text/markdown", text: documentText },
    });
    expect(upload.statusCode).toBe(201);
    const doc = upload.json();
    expect(doc.text).toBe(documentText);
    const documentId = doc.id as string;

    const getDoc = await app.inject({ method: "GET", url: `/api/rag/documents/${documentId}` });
    expect(getDoc.statusCode).toBe(200);

    const chunkRes = await app.inject({
      method: "POST",
      url: `/api/rag/documents/${documentId}/chunk`,
      payload: { config: { strategy: "markdown", chunkSize: 20, chunkOverlap: 2 } },
    });
    expect(chunkRes.statusCode).toBe(200);
    const chunks = chunkRes.json().chunks;
    expect(chunks.length).toBeGreaterThan(0);

    const embedRes = await app.inject({
      method: "POST",
      url: `/api/rag/documents/${documentId}/embed`,
      payload: { providerId: "mock", model: "mock-small" },
    });
    expect(embedRes.statusCode).toBe(200);
    expect(embedRes.json().chunks.every((c: { embedding?: number[] }) => Array.isArray(c.embedding))).toBe(true);

    const indexRes = await app.inject({
      method: "POST",
      url: `/api/rag/documents/${documentId}/index`,
      payload: { collection },
    });
    expect(indexRes.statusCode).toBe(200);
    expect(indexRes.json()).toEqual({ ok: true, count: chunks.length });

    const countRes = await app.inject({ method: "GET", url: `/api/vector/collections/${collection}/count` });
    expect(countRes.json().count).toBe(chunks.length);
  });

  it("retrieves and generates an answer WITH citations linking back to real indexed chunks (SSE)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/rag/query",
      headers: { accept: "text/event-stream" },
      payload: {
        query: "What is the return policy exception for perishable goods?",
        collection,
        strategy: "basic",
        topK: 3,
        providerId: "mock",
        model: "mock-small",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");

    const frames = res.payload
      .split("\n\n")
      .filter((f) => f.trim().length > 0 && !f.startsWith(":"))
      .map((f) => {
        const line = f.split("\n").find((l) => l.startsWith("data:"))!;
        return JSON.parse(line.slice("data:".length).trim());
      });

    expect(frames.some((f) => f.type === "stage" && f.stage === "retrieve")).toBe(true);
    expect(frames.some((f) => f.type === "run_start")).toBe(true);
    expect(frames.some((f) => f.type === "token")).toBe(true);
    expect(frames[frames.length - 1]).toEqual({ type: "done" });

    const complete = frames.find((f) => f.type === "run_complete");
    expect(complete).toBeDefined();
    const run = complete.run;
    expect(run.status).toBe("complete");
    expect(run.output.text.length).toBeGreaterThan(0);

    const citations = run.metadata.citations as { chunkId: string; documentId: string }[];
    expect(citations.length).toBeGreaterThan(0);
    for (const c of citations) {
      expect(typeof c.chunkId).toBe("string");
      expect(typeof c.documentId).toBe("string");
    }

    // Confirm each citation links back to a REAL chunk actually in the vector store.
    for (const c of citations) {
      const searchRes = await app.inject({
        method: "POST",
        url: `/api/vector/collections/${collection}/search`,
        payload: { vector: new Array(64).fill(0), topK: 50 },
      });
      const hits = searchRes.json().hits as { id: string; metadata: Record<string, unknown> }[];
      expect(hits.some((h) => h.id === c.chunkId)).toBe(true);
    }
  });

  it("GET /api/runs/:id can fetch the persisted RAG run with its citations intact", async () => {
    const queryRes = await app.inject({
      method: "POST",
      url: "/api/rag/query",
      headers: { accept: "text/event-stream" },
      payload: { query: "How do I contact support?", collection, strategy: "basic", topK: 2, providerId: "mock", model: "mock-small" },
    });
    const frames = queryRes.payload
      .split("\n\n")
      .filter((f) => f.trim().length > 0 && !f.startsWith(":"))
      .map((f) => JSON.parse(f.split("\n").find((l) => l.startsWith("data:"))!.slice("data:".length).trim()));
    const runId = frames.find((f) => f.type === "run_start").runId as string;

    const runRes = await app.inject({ method: "GET", url: `/api/runs/${runId}` });
    expect(runRes.statusCode).toBe(200);
    const run = runRes.json();
    expect(run.moduleId).toBe("rag");
    expect(run.metadata.citations).toBeDefined();
  });

  it("DELETE /api/rag/documents/:id also removes its vector-store points", async () => {
    const upload = await app.inject({
      method: "POST",
      url: "/api/rag/documents",
      payload: { name: "throwaway.txt", mimeType: "text/plain", text: "A short throwaway document for deletion testing." },
    });
    const documentId = upload.json().id as string;
    await app.inject({
      method: "POST",
      url: `/api/rag/documents/${documentId}/chunk`,
      payload: { config: { strategy: "fixed", chunkSize: 5, chunkOverlap: 0 } },
    });
    await app.inject({
      method: "POST",
      url: `/api/rag/documents/${documentId}/embed`,
      payload: { providerId: "mock", model: "mock-small" },
    });
    await app.inject({
      method: "POST",
      url: `/api/rag/documents/${documentId}/index`,
      payload: { collection: "delete-test-collection" },
    });
    const countBefore = await app.inject({ method: "GET", url: "/api/vector/collections/delete-test-collection/count" });
    expect(countBefore.json().count).toBeGreaterThan(0);

    const del = await app.inject({ method: "DELETE", url: `/api/rag/documents/${documentId}` });
    expect(del.statusCode).toBe(200);

    const countAfter = await app.inject({ method: "GET", url: "/api/vector/collections/delete-test-collection/count" });
    expect(countAfter.json().count).toBe(0);

    const getAfter = await app.inject({ method: "GET", url: `/api/rag/documents/${documentId}` });
    expect(getAfter.statusCode).toBe(404);
  });
});
