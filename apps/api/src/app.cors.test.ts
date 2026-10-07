import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-cors-streams.db");
process.env.WEB_ORIGIN = "https://ai-engineer-lab.vercel.app";
process.env.RATE_LIMIT_MAX = "1000";
process.env.LLM_PROVIDER = "mock";

const { buildApp } = await import("./app.js");
const { closeDb } = await import("./db/index.js");

describe("production cross-origin streaming", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => { app = await buildApp({ logger: false }); });
  afterAll(async () => { await app.close(); closeDb(); });

  it.each(["https://ai-engineer-lab.vercel.app", "https://ai-engineer-lab.onrender.com"])("preserves CORS and rate-limit headers for %s on a real streaming route", async origin => {
    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/api/fundamentals/sample",
      headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe(origin);
    const response = await app.inject({
      method: "POST",
      url: "/api/fundamentals/sample",
      headers: { origin },
      payload: { providerId: "mock", model: "mock-small", messages: [{ role: "user", content: "Hello" }], params: { maxOutputTokens: 8 }, n: 1 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers.vary).toContain("Origin");
    expect(response.headers["x-ratelimit-limit"]).toBeDefined();
    expect(response.headers["x-request-id"]).toBeTruthy();
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("event: run_complete");
    expect(response.body).toContain("event: done");
  });

  it("does not grant streaming access to an unconfigured origin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/fundamentals/sample",
      headers: { origin: "https://untrusted.example" },
      payload: { providerId: "mock", model: "mock-small", messages: [{ role: "user", content: "Hello" }], params: { maxOutputTokens: 8 } },
    });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
