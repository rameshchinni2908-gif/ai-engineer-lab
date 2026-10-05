import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-routes-mcp.db");
process.env.RATE_LIMIT_MAX = "1000";

const { buildApp } = await import("../../app.js");
const { closeDb } = await import("../../db/index.js");

describe("routes: /api/mcp", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  it("GET /api/mcp/servers lists mock in-process servers with status 'connected' (zero external setup)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/mcp/servers" });
    expect(res.statusCode).toBe(200);
    const { servers } = res.json();
    expect(servers.length).toBeGreaterThanOrEqual(2);
    expect(servers.every((s: { status: string }) => s.status === "connected")).toBe(true);
  });

  it("GET /api/mcp/servers/:id/tools lists that server's tools with schemas", async () => {
    const res = await app.inject({ method: "GET", url: "/api/mcp/servers/docs-server/tools" });
    expect(res.statusCode).toBe(200);
    const { tools } = res.json();
    expect(tools.some((t: { name: string }) => t.name === "search_docs")).toBe(true);
    expect(tools[0].inputSchema).toBeDefined();
  });

  it("GET /api/mcp/servers/:id/tools 404s for an unknown server", async () => {
    const res = await app.inject({ method: "GET", url: "/api/mcp/servers/nope/tools" });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/mcp/servers/:id/tools/:toolName/call invokes the tool directly and returns a ToolResult", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/mcp/servers/docs-server/tools/search_docs/call",
      payload: { arguments: { query: "mcp" } },
    });
    expect(res.statusCode).toBe(200);
    const result = res.json();
    expect(result.isError).toBe(false);
    expect(result.content).toContain("mcp");
  });

  it("POST .../call 404s for an unknown tool on a known server", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/mcp/servers/docs-server/tools/not_a_tool/call",
      payload: { arguments: {} },
    });
    expect(res.statusCode).toBe(404);
  });
});
