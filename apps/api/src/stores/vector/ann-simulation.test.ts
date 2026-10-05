import { describe, expect, it } from "vitest";
import { annProfileFor, degradeRanking } from "./ann-simulation.js";
import type { VectorSearchHit } from "@ail/shared";

function hit(id: string, score: number): VectorSearchHit {
  return { id, score, metadata: {} };
}

describe("annProfileFor", () => {
  it("flat (or no index) is always exact ground truth with zero simulated latency", () => {
    expect(annProfileFor(undefined)).toEqual({ recallFactor: 1, latencyMs: 0 });
    expect(annProfileFor({ kind: "flat" })).toEqual({ recallFactor: 1, latencyMs: 0 });
  });

  it("hnsw recall increases with higher efSearch (deterministically)", () => {
    const low = annProfileFor({ kind: "hnsw", efSearch: 10, m: 16 });
    const high = annProfileFor({ kind: "hnsw", efSearch: 190, m: 16 });
    expect(high.recallFactor).toBeGreaterThan(low.recallFactor);
  });

  it("hnsw latency decreases with higher efSearch (the trade-off)", () => {
    const low = annProfileFor({ kind: "hnsw", efSearch: 10 });
    const high = annProfileFor({ kind: "hnsw", efSearch: 190 });
    expect(high.latencyMs).toBeLessThan(low.latencyMs);
  });

  it("ivf recall increases with a higher nprobe/nlist ratio", () => {
    const low = annProfileFor({ kind: "ivf", nlist: 100, nprobe: 1 });
    const high = annProfileFor({ kind: "ivf", nlist: 100, nprobe: 50 });
    expect(high.recallFactor).toBeGreaterThan(low.recallFactor);
  });

  it("is deterministic for identical config", () => {
    const a = annProfileFor({ kind: "hnsw", efSearch: 64, m: 32 });
    const b = annProfileFor({ kind: "hnsw", efSearch: 64, m: 32 });
    expect(a).toEqual(b);
  });
});

describe("degradeRanking", () => {
  const pool: VectorSearchHit[] = Array.from({ length: 20 }, (_, i) => hit(`id${i}`, 20 - i));

  it("returns the exact pool unchanged when recallFactor is ~1", () => {
    const result = degradeRanking(pool, 5, 0.999, true);
    expect(result.map((h) => h.id)).toEqual(["id0", "id1", "id2", "id3", "id4"]);
  });

  it("drops some true top-K members when recallFactor < 1", () => {
    const result = degradeRanking(pool, 10, 0.5, true);
    const trueTopIds = pool.slice(0, 10).map((h) => h.id);
    const missing = trueTopIds.filter((id) => !result.some((h) => h.id === id));
    expect(missing.length).toBeGreaterThan(0);
    expect(result).toHaveLength(10);
  });

  it("is deterministic given the same inputs", () => {
    const a = degradeRanking(pool, 8, 0.6, true);
    const b = degradeRanking(pool, 8, 0.6, true);
    expect(a).toEqual(b);
  });

  it("respects higherIsBetter=false (euclidean-style distance) ordering", () => {
    const distPool: VectorSearchHit[] = Array.from({ length: 10 }, (_, i) => hit(`id${i}`, i)); // ascending distance = better
    const result = degradeRanking(distPool, 5, 0.999, false);
    expect(result.map((h) => h.id)).toEqual(["id0", "id1", "id2", "id3", "id4"]);
  });
});
