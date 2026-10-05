import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-batching-sim.db");

const { closeDb } = await import("../../db/index.js");
const { runBatchingSim } = await import("./batching-sim.js");

describe("batching-sim", () => {
  afterAll(() => closeDb());

  it("issues exactly one call per request when unbatched, grouped calls when batched", async () => {
    const result = await runBatchingSim({
      requests: [{ prompt: "a" }, { prompt: "b" }, { prompt: "c" }, { prompt: "d" }, { prompt: "e" }],
      batchSize: 2,
      providerId: "mock",
      model: "mock-small",
    });
    expect(result.unbatched.requestCount).toBe(5);
    expect(result.batched.batchCount).toBe(3); // ceil(5/2)
  });

  it("rejects a batchSize below 1", async () => {
    await expect(
      runBatchingSim({ requests: [{ prompt: "a" }], batchSize: 0, providerId: "mock", model: "mock-small" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("a single-request batch (batchSize >= requests.length) produces exactly one batch", async () => {
    const result = await runBatchingSim({
      requests: [{ prompt: "a" }, { prompt: "b" }],
      batchSize: 10,
      providerId: "mock",
      model: "mock-small",
    });
    expect(result.batched.batchCount).toBe(1);
  });

  it("reports a latency saving when batching reduces the number of real calls", async () => {
    const result = await runBatchingSim({
      requests: Array.from({ length: 6 }, (_, i) => ({ prompt: `q${i}` })),
      batchSize: 3,
      providerId: "mock",
      model: "mock-small",
    });
    expect(result.batched.batchCount).toBe(2);
    expect(result.latencySavingsPct).toBeGreaterThanOrEqual(0);
  });
});
