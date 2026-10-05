import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import type { SseEvent } from "@ail/shared";
import type { SseWriter } from "../plugins/sse.js";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-platform.db");
// High cap for the general platform-routes app (that describe block issues
// more requests than a realistic per-IP cap); the dedicated rate-limit
// describe below lowers this just before building ITS OWN app instance.
process.env.RATE_LIMIT_MAX = "1000";
process.env.RATE_LIMIT_WINDOW_MS = "60000";

const { buildApp } = await import("../app.js");
const { closeDb } = await import("../db/index.js");
const { streamGeneration } = await import("../services/runs/generation.js");

function fakeWriter(): SseWriter {
  return {
    send(_ev: SseEvent) {},
    ping() {},
    close() {},
  };
}

describe("platform routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  it("GET /api/health reports provider config booleans, never key values", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.providers.configured.mock).toBe(true);
    expect(JSON.stringify(body)).not.toContain("sk-");
  });

  it("GET /api/models returns the static catalog", async () => {
    const res = await app.inject({ method: "GET", url: "/api/models?providerId=mock" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models.every((m: { providerId: string }) => m.providerId === "mock")).toBe(true);
  });

  it("GET /api/providers reports availability without leaking the actual key value", async () => {
    const FAKE_KEY = "sk-ant-FAKE_TEST_KEY_SHOULD_NOT_LEAK_987654321";
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    try {
      const res = await app.inject({ method: "GET", url: "/api/providers" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const anthropic = body.providers.find((p: { id: string }) => p.id === "anthropic");
      expect(anthropic.available).toBe(true);
      expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
    } finally {
      process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("GET /api/models does not leak a configured provider key value", async () => {
    const FAKE_KEY = "sk-openai-FAKE_TEST_KEY_SHOULD_NOT_LEAK_123456789";
    const original = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = FAKE_KEY;
    try {
      const res = await app.inject({ method: "GET", url: "/api/models" });
      expect(res.statusCode).toBe(200);
      expect(JSON.stringify(res.json())).not.toContain(FAKE_KEY);
    } finally {
      process.env.OPENAI_API_KEY = original;
    }
  });

  it("every response echoes x-request-id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { "x-request-id": "req_fixed_123" },
    });
    expect(res.headers["x-request-id"]).toBe("req_fixed_123");
  });

  it("unknown routes return the ApiErrorSchema 404 envelope", async () => {
    const res = await app.inject({ method: "GET", url: "/api/does-not-exist" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.code).toBe("NOT_FOUND");
    expect(body.requestId).toBeTypeOf("string");
  });

  it("GET /api/runs/:id returns 404 NOT_FOUND for a missing run", async () => {
    const res = await app.inject({ method: "GET", url: "/api/runs/does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
  });

  it("GET /api/traces/:id returns 404 NOT_FOUND for a missing trace", async () => {
    const res = await app.inject({ method: "GET", url: "/api/traces/does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
  });

  it("POST /api/explain-run returns 404 for a missing run", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/explain-run",
      payload: { runId: "does-not-exist" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/explain-run with comparisonRunId cites values from BOTH runs", async () => {
    const runA = await streamGeneration({
      moduleId: "fundamentals",
      feature: "explain-compare-test",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Explain vector indexes" }],
      params: { temperature: 0.1, seed: 4242 },
      writer: fakeWriter(),
    });
    const runB = await streamGeneration({
      moduleId: "fundamentals",
      feature: "explain-compare-test",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Explain vector indexes" }],
      params: { temperature: 1.6, seed: 4242 },
      writer: fakeWriter(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/explain-run",
      payload: { runId: runA.id, comparisonRunId: runB.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const comparisonFactor = body.factors.find((f: { label: string }) =>
      f.label.includes(runB.id),
    );
    expect(comparisonFactor).toBeDefined();
    expect(comparisonFactor.detail).toContain(String(runB.params.temperature));
    expect(comparisonFactor.detail).toContain(runB.id);
  });

  it("validation failures return 400 VALIDATION_ERROR", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/explain-run",
      payload: { runId: 42 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });

  it("a module route folder that does not exist is skipped, not fatal", async () => {
    // The "not fatal" property is that buildApp() in beforeAll resolved at all:
    // registerModuleRoutes walks a fixed list of 13 folders and must skip any
    // that is absent rather than reject. Asserting a *specific* module 404s is
    // not durable (Wave 2 implements them one by one), so assert an unroutable
    // path under the registry's own namespace instead.
    expect(app.hasRoute({ method: "GET", url: "/api/health" })).toBe(true);
    const res = await app.inject({
      method: "POST",
      url: "/api/not-a-module/definitely-not-a-route",
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
  });
});

describe("central error handler never leaks a stack trace or env values", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    // Throwaway route registered directly on the built app purely to
    // exercise the "genuinely unexpected exception" path of the central
    // error handler - never a real product route.
    app.get("/__boom", async () => {
      throw new Error("boom with /secret/path");
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns only code/message/requestId - no stack, no file path, no env values", async () => {
    const res = await app.inject({ method: "GET", url: "/__boom" });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(["code", "message", "requestId"].sort());
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.requestId).toBeTypeOf("string");

    const raw = res.body;
    expect(raw).not.toContain("/secret/path");
    expect(raw).not.toContain("boom with");
    expect(raw.toLowerCase()).not.toContain("stack");
    expect(raw).not.toContain(process.cwd());
    expect(raw).not.toContain("DATABASE_PATH");
  });
});

describe("per-IP rate limiting", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    process.env.RATE_LIMIT_MAX = "5";
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 429 RATE_LIMITED with headers once the per-IP cap is exceeded", async () => {
    let last;
    for (let i = 0; i < 6; i++) {
      last = await app.inject({ method: "GET", url: "/api/providers" });
    }
    expect(last!.statusCode).toBe(429);
    expect(last!.json().code).toBe("RATE_LIMITED");
    expect(last!.headers["x-ratelimit-limit"]).toBeDefined();
    expect(last!.headers["retry-after"]).toBeDefined();
  });
});
