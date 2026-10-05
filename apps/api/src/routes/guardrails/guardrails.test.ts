import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-guardrails-routes.db");
process.env.LLM_PROVIDER = "mock";
process.env.RATE_LIMIT_MAX = "1000";

const { buildApp } = await import("../../app.js");
const { closeDb } = await import("../../db/index.js");
const { DEFAULT_GUARDRAIL_CONFIG, FULLY_DEFENDED_CONFIG } = await import("../../services/guardrails/config.js");

describe("guardrails routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  it("GET /guardrails/config returns the default config", async () => {
    const res = await app.inject({ method: "GET", url: "/api/guardrails/config" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(DEFAULT_GUARDRAIL_CONFIG);
  });

  it("PUT /guardrails/config persists the new config and writes an audit entry", async () => {
    const putRes = await app.inject({ method: "PUT", url: "/api/guardrails/config", payload: FULLY_DEFENDED_CONFIG });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json()).toEqual(FULLY_DEFENDED_CONFIG);

    const getRes = await app.inject({ method: "GET", url: "/api/guardrails/config" });
    expect(getRes.json()).toEqual(FULLY_DEFENDED_CONFIG);

    const auditRes = await app.inject({ method: "GET", url: "/api/guardrails/audit-log?resourceType=guardrail_config" });
    expect(auditRes.json().items.some((e: { action: string }) => e.action === "guardrail.config.update")).toBe(true);

    // Reset back to undefended for the rest of this file's tests.
    await app.inject({ method: "PUT", url: "/api/guardrails/config", payload: DEFAULT_GUARDRAIL_CONFIG });
  });

  it("GET /guardrails/attacks lists the catalog without leaking literal payload text", async () => {
    const res = await app.inject({ method: "GET", url: "/api/guardrails/attacks" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.attacks.length).toBeGreaterThanOrEqual(6);
    const categories = new Set(body.attacks.map((a: { category: string }) => a.category));
    expect(categories).toEqual(
      new Set(["direct_injection", "indirect_injection", "jailbreak", "exfiltration", "tool_abuse", "prompt_leak"]),
    );
    expect(JSON.stringify(body)).not.toContain("sk-demo-");
  });

  it("GET /guardrails/owasp-map returns all 10 categories with attackIds populated where demoed", async () => {
    const res = await app.inject({ method: "GET", url: "/api/guardrails/owasp-map" });
    expect(res.statusCode).toBe(200);
    const mappings = res.json().mappings;
    expect(mappings).toHaveLength(10);
    const llm01 = mappings.find((m: { owaspId: string }) => m.owaspId === "LLM01");
    expect(llm01.attackIds.length).toBeGreaterThan(0);
  });

  it("404s POST /guardrails/attack for an unknown attackId", async () => {
    const res = await app.inject({ method: "POST", url: "/api/guardrails/attack", payload: { attackId: "does-not-exist" } });
    expect(res.statusCode).toBe(404);
  });

  it("the headline flow: attack succeeds undefended via SSE, then the SAME attack is blocked after PUT-ing full defenses", async () => {
    await app.inject({ method: "PUT", url: "/api/guardrails/config", payload: DEFAULT_GUARDRAIL_CONFIG });

    const undefendedRes = await app.inject({
      method: "POST",
      url: "/api/guardrails/attack",
      headers: { accept: "text/event-stream" },
      payload: { attackId: "direct-injection-reveal-secret" },
    });
    expect(undefendedRes.statusCode).toBe(200);
    expect(undefendedRes.body).toContain("event: run_complete");
    expect(undefendedRes.body).toContain("sk-demo-");

    await app.inject({ method: "PUT", url: "/api/guardrails/config", payload: FULLY_DEFENDED_CONFIG });

    const defendedRes = await app.inject({
      method: "POST",
      url: "/api/guardrails/attack",
      headers: { accept: "text/event-stream" },
      payload: { attackId: "direct-injection-reveal-secret" },
    });
    expect(defendedRes.statusCode).toBe(200);
    expect(defendedRes.body).not.toContain("sk-demo-");
    expect(defendedRes.body).toContain('"layer":"injectionClassifier"');
    expect(defendedRes.body).toContain('"action":"block"');

    await app.inject({ method: "PUT", url: "/api/guardrails/config", payload: DEFAULT_GUARDRAIL_CONFIG });
  });

  it("GET /guardrails/audit-log reflects both the attack run and its blocking finding", async () => {
    const res = await app.inject({ method: "GET", url: "/api/guardrails/audit-log?resourceType=attack" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThan(0);
  });
});
