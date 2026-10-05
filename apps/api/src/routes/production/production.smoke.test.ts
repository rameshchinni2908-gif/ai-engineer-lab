import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-production-routes.db");
process.env.RATE_LIMIT_MAX = "1000";
process.env.RATE_LIMIT_WINDOW_MS = "60000";

const { buildApp } = await import("../../app.js");
const { closeDb } = await import("../../db/index.js");

describe("production/advanced/checklist routes are registered and reachable", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  it("GET /api/production/cost-summary works with zero keys (mock mode)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/production/cost-summary?groupBy=module" });
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toBeInstanceOf(Array);
  });

  it("POST /api/production/cache-sim runs end to end via HTTP", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/production/cache-sim",
      payload: { cacheType: "prompt", requests: [{ prompt: "hi" }, { prompt: "hi" }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().hits).toBe(1);
  });

  it("POST /api/production/reliability-sim validates the body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/production/reliability-sim",
      payload: { scenario: "timeout", policy: { maxRetries: -1, backoffMs: 10 } },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/advanced/reasoning-presets works with zero keys", async () => {
    const res = await app.inject({ method: "GET", url: "/api/advanced/reasoning-presets" });
    expect(res.statusCode).toBe(200);
    expect(res.json().presets.length).toBeGreaterThan(0);
  });

  it("POST /api/advanced/attention-heatmap returns tokens+attention", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/advanced/attention-heatmap",
      payload: { text: "hello world", providerId: "mock", model: "mock-small" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tokens.length).toBeGreaterThan(0);
    expect(body.note).toBeDefined();
  });

  it("POST /api/advanced/multimodal-demo returns 422 for a non-vision model", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/advanced/multimodal-demo",
      payload: {
        messages: [{ role: "user", content: "describe this" }],
        providerId: "mock",
        model: "mock-small",
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it("GET /api/checklist/progress works with zero keys", async () => {
    const res = await app.inject({ method: "GET", url: "/api/checklist/progress" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("completedItemIds");
  });

  it("POST /api/checklist/progress/complete-item persists state", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/checklist/progress/complete-item",
      payload: { itemId: "test-item", completed: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().completedItemIds).toContain("test-item");
  });

  it("POST /api/checklist/quiz/:quizId/submit scores a submission", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/checklist/quiz/production/submit",
      payload: { answers: { "production-q1": "1" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.correct["production-q1"]).toBe(true);
  });

  it("every route echoes x-request-id", async () => {
    const res = await app.inject({ method: "GET", url: "/api/production/latency-lab/presets" });
    expect(res.headers["x-request-id"]).toBeDefined();
  });
});
