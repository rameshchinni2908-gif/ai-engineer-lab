import type { IndexConfig, VectorSearchHit } from "@ail/shared";

/**
 * SIMULATED HNSW/IVF behaviour for the InMemoryStore. This app does not ship
 * a real approximate-nearest-neighbour implementation - `IndexConfig` is
 * honoured by deterministically degrading the exact (Flat) ranking and
 * injecting an artificial delay, both derived from the tunable parameters
 * (m/efSearch, nlist/nprobe), so the "index trade-offs" lab gets genuinely
 * different, genuinely MEASURABLE (by the caller's own wall-clock timing)
 * recall/latency numbers per index kind - while staying honest that the
 * underlying mechanism is a teaching simulation, not a real ANN index.
 * Every caller-facing surface (frontend) must label these figures as
 * simulated, per CLAUDE.md/docs/contracts.md.
 */

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface AnnProfile {
  /** Fraction (0-1) of the TRUE top-K the simulated index is configured to actually recall. */
  recallFactor: number;
  /** Simulated extra latency in ms this search should "cost" versus exact Flat search. */
  latencyMs: number;
}

/** Pure: derives a deterministic recall/latency profile from an `IndexConfig`. */
export function annProfileFor(index: IndexConfig | undefined): AnnProfile {
  if (!index || index.kind === "flat") {
    return { recallFactor: 1, latencyMs: 0 };
  }
  if (index.kind === "hnsw") {
    const efSearch = index.efSearch ?? 50;
    const m = index.m ?? 16;
    const recallFactor = clamp(0.55 + 0.35 * (efSearch / 200) + 0.1 * (m / 64), 0.4, 0.999);
    const latencyMs = clamp(40 - efSearch / 8, 2, 45);
    return { recallFactor, latencyMs };
  }
  // ivf
  const nlist = index.nlist ?? 100;
  const nprobe = index.nprobe ?? 10;
  const ratio = nlist > 0 ? nprobe / nlist : 0.1;
  const recallFactor = clamp(0.35 + ratio * 3, 0.3, 0.999);
  const latencyMs = clamp(55 * (1 - clamp(ratio, 0, 1)), 2, 55);
  return { recallFactor, latencyMs };
}

/**
 * Deterministically degrades an EXACT ranked candidate pool (longer than
 * `topK`) down to `topK` results that reflect `recallFactor`: the true top
 * `keep` positions are preserved, the remaining slots are backfilled from
 * just beyond the true top-K (simulating "approximate search substituted
 * slightly-worse neighbours"), then the final set is re-sorted by true score
 * so results still display in a sensible order.
 */
export function degradeRanking(
  exactPool: VectorSearchHit[],
  topK: number,
  recallFactor: number,
  higherIsBetter: boolean,
): VectorSearchHit[] {
  if (exactPool.length <= topK || recallFactor >= 0.999) {
    return exactPool.slice(0, topK);
  }
  const keep = Math.max(1, Math.round(topK * recallFactor));
  const kept = exactPool.slice(0, keep);
  const substitutesNeeded = topK - keep;
  const substitutes = exactPool.slice(topK, topK + substitutesNeeded * 2).filter((_, i) => i % 2 === 0).slice(0, substitutesNeeded);
  const merged = [...kept, ...substitutes];
  merged.sort((a, b) => (higherIsBetter ? b.score - a.score : a.score - b.score));
  return merged.slice(0, topK);
}

export function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
