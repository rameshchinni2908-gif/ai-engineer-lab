import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { closeDb } from "./db/index.js";

describe("GET /health", () => {
  afterAll(() => {
    closeDb();
  });

  it("returns ok status, mode, and provider availability", async () => {
    const app = await buildApp({ logger: false });
    const res = await app.inject({ method: "GET", url: "/api/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.mode).toBeTypeOf("string");
    expect(body.providers.configured.mock).toBe(true);

    await app.close();
  });
});
