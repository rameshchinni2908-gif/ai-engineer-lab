import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-embeddings-routes.db");
process.env.RATE_LIMIT_MAX = "1000";
process.env.RATE_LIMIT_WINDOW_MS = "60000";

const { buildApp } = await import("../../app.js");
const { closeDb } = await import("../../db/index.js");

describe("embeddings routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  it("POST /api/embeddings/embed returns deterministic mock embeddings with a matching dim", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/embeddings/embed",
      payload: { texts: ["hello world", "hello world"], providerId: "mock", model: "mock-small" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.embeddings).toHaveLength(2);
    expect(body.embeddings[0]).toEqual(body.embeddings[1]); // deterministic: same text -> same vector
    expect(body.dim).toBe(body.embeddings[0].length);
  });

  it("POST /api/embeddings/similarity computes cosine similarity", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/embeddings/similarity",
      payload: { a: [1, 0], b: [1, 0], metric: "cosine" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().score).toBeCloseTo(1, 5);
  });

  it("POST /api/embeddings/similarity returns 422 on dimension mismatch", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/embeddings/similarity",
      payload: { a: [1, 0], b: [1, 0, 0], metric: "cosine" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("UNPROCESSABLE");
  });

  it("POST /api/embeddings/project-2d returns one point per input embedding", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/embeddings/project-2d",
      payload: { embeddings: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], method: "pca" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().points).toHaveLength(3);
  });

  it("POST /api/embeddings/project-2d discloses the PCA fallback for method=umap", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/embeddings/project-2d",
      payload: { embeddings: [[1, 0], [0, 1]], method: "umap" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().note).toMatch(/PCA/);
  });

  it("POST /api/embeddings/chunk-preview returns chunks for a fixed-size config", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/embeddings/chunk-preview",
      payload: {
        text: "one two three four five six seven eight nine ten",
        config: { strategy: "fixed", chunkSize: 3, chunkOverlap: 1 },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().chunks.length).toBeGreaterThan(1);
  });

  it("POST /api/embeddings/chunk-preview returns 422 for an invalid chunk config (overlap >= size)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/embeddings/chunk-preview",
      payload: { text: "some text", config: { strategy: "fixed", chunkSize: 5, chunkOverlap: 5 } },
    });
    expect(res.statusCode).toBe(422);
  });

  it("validates request bodies and returns 400 VALIDATION_ERROR for a malformed body", async () => {
    const res = await app.inject({ method: "POST", url: "/api/embeddings/similarity", payload: { a: [1] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });
});
