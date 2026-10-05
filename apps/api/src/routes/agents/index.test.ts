import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-routes-agents.db");
process.env.RATE_LIMIT_MAX = "1000";

const { buildApp } = await import("../../app.js");
const { closeDb } = await import("../../db/index.js");

function baseLimits() {
  return {
    maxSteps: 10,
    budgetUsd: 1000,
    timeoutMs: 10_000,
    loopDetection: { enabled: true, window: 3, similarityThreshold: 0.95 },
    requireApprovalForDangerousTools: false,
  };
}

/** Minimal SSE body parser for assertions - splits on the blank-line frame terminator per contracts §2.1. */
function parseSseEvents(body: string): { type: string; data: unknown }[] {
  return body
    .split("\n\n")
    .filter((frame) => frame.trim().length > 0 && !frame.startsWith(":"))
    .map((frame) => {
      const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
      return { type: "frame", data: dataLine ? JSON.parse(dataLine.slice("data: ".length)) : undefined };
    });
}

describe("routes: /api/agents", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  it("GET /api/agents/tools returns the six built-in tools, with dangerous ones flagged", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agents/tools" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const names = body.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(["calculator", "code_sandbox", "file_reader", "http_fetch", "vector_search", "web_search"]);
    const sandbox = body.tools.find((t: { name: string }) => t.name === "code_sandbox");
    expect(sandbox.dangerous).toBe(true);
    const calc = body.tools.find((t: { name: string }) => t.name === "calculator");
    expect(calc.dangerous).toBeFalsy();
  });

  it("GET /api/agents/:id 404s for a missing run", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agents/does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
  });

  it("GET /api/agents/:id/memory 404s for a missing run", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agents/does-not-exist/memory" });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/agents/:id/approve 409s when nothing is pending at that step", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/agents/some-run/approve",
      payload: { stepIndex: 0, approved: true },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("CONFLICT");
  });

  it("POST /api/agents/run streams run_start -> agent_step* -> run_complete -> done over SSE, and GET /api/agents/:id then returns the full step history", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/agents/run",
      headers: { accept: "text/event-stream" },
      payload: {
        runtime: "react",
        goal: "What is 2 + 2?",
        toolAllowList: ["calculator"],
        providerId: "mock",
        model: "mock-small",
        limits: baseLimits(),
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    const frames = parseSseEvents(res.body);
    expect(frames.some((f) => (f.data as { type: string }).type === "run_start")).toBe(true);
    expect(frames.some((f) => (f.data as { type: string }).type === "agent_step")).toBe(true);
    const complete = frames.find((f) => (f.data as { type: string }).type === "run_complete");
    expect(complete).toBeDefined();
    expect(frames.at(-1)?.data).toEqual({ type: "done" });

    const runId = (complete!.data as { runId: string }).runId;
    const getRes = await app.inject({ method: "GET", url: `/api/agents/${runId}` });
    expect(getRes.statusCode).toBe(200);
    const agentRun = getRes.json();
    expect(agentRun.stopReason).toBe("final");
    expect(agentRun.steps.length).toBeGreaterThan(0);

    const memRes = await app.inject({ method: "GET", url: `/api/agents/${runId}/memory` });
    expect(memRes.statusCode).toBe(200);
    expect(memRes.json().shortTerm.length).toBeGreaterThan(0);
  }, 20_000);

  it("rejects an invalid body with 400 VALIDATION_ERROR before ever opening the SSE stream", async () => {
    const res = await app.inject({ method: "POST", url: "/api/agents/run", payload: { runtime: "not-a-runtime" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });
});
