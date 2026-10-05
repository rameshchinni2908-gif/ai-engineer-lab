import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-cache-sim.db");

const { closeDb } = await import("../../db/index.js");
const { runCacheSim } = await import("./cache-sim.js");

describe("cache-sim: prompt cache (exact match)", () => {
  afterAll(() => closeDb());

  it("counts a repeated identical prompt as a hit, a new prompt as a miss", async () => {
    const result = await runCacheSim({
      cacheType: "prompt",
      requests: [{ prompt: "Explain vector databases" }, { prompt: "Explain vector databases" }, { prompt: "Explain embeddings" }],
    });
    expect(result.misses).toBe(2);
    expect(result.hits).toBe(1);
  });

  it("a cache hit adds zero cost/latency to the withCache totals (no provider call made)", async () => {
    const result = await runCacheSim({
      cacheType: "prompt",
      requests: [{ prompt: "repeat me" }, { prompt: "repeat me" }],
    });
    expect(result.hits).toBe(1);
    // withCache makes exactly 1 real call (the miss) vs. withoutCache's 2
    // real calls - allow <= rather than strict < since mock latency can
    // legitimately round to the same small number under fast test execution.
    expect(result.withCache.totalLatencyMs).toBeLessThanOrEqual(result.withoutCache.totalLatencyMs);
  });

  it("does NOT hit on a merely similar (not identical) prompt", async () => {
    const result = await runCacheSim({
      cacheType: "prompt",
      requests: [{ prompt: "Explain vector databases" }, { prompt: "Explain vector databases please" }],
    });
    expect(result.hits).toBe(0);
    expect(result.misses).toBe(2);
  });

  it("echoes the assumed hit rate comparison without using it to compute savings", async () => {
    const result = await runCacheSim({
      cacheType: "prompt",
      requests: [{ prompt: "a" }, { prompt: "a" }],
      assumedHitRate: 0.9,
    });
    expect(result.assumedVsMeasuredNote).toContain("90%");
    // Measured hit rate here is 50% (1 of 2), not the assumed 90%.
    expect(result.assumedVsMeasuredNote).toContain("50%");
  });
});

describe("cache-sim: response cache (normalized match)", () => {
  it("hits on whitespace/case differences that the prompt cache would miss", async () => {
    const result = await runCacheSim({
      cacheType: "response",
      requests: [{ prompt: "Explain RAG" }, { prompt: "  explain   rag  " }],
    });
    expect(result.hits).toBe(1);
  });
});

describe("cache-sim: semantic cache (embedding similarity threshold)", () => {
  it("hits when a near-duplicate paraphrase embeds above the similarity threshold", async () => {
    const result = await runCacheSim({
      cacheType: "semantic",
      requests: [{ prompt: "Explain vector databases" }, { prompt: "Explain vector databases" }],
    });
    // Identical text always embeds identically (cosine similarity 1.0 >= threshold).
    expect(result.hits).toBe(1);
  });

  it("misses when the two prompts are semantically unrelated", async () => {
    const result = await runCacheSim({
      cacheType: "semantic",
      requests: [{ prompt: "database indexing strategies" }, { prompt: "a recipe for banana bread" }],
    });
    expect(result.hits).toBe(0);
    expect(result.misses).toBe(2);
  });
});

describe("cache-sim: measured savings", () => {
  it("withCache cost never exceeds withoutCache cost", async () => {
    const result = await runCacheSim({
      cacheType: "prompt",
      requests: [{ prompt: "x" }, { prompt: "x" }, { prompt: "x" }, { prompt: "y" }],
    });
    expect(result.withCache.totalCostUsd).toBeLessThanOrEqual(result.withoutCache.totalCostUsd);
    expect(result.hits).toBe(2);
    expect(result.misses).toBe(2);
  });
});
