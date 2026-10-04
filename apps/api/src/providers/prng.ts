/**
 * Deterministic hashing + PRNG utilities backing `MockProvider`. Pure,
 * framework-free, and unit-tested directly (see `prng.test.ts`) because the
 * entire "change temperature, see token-probability shifts" acceptance
 * criterion depends on these being honest math, not noise.
 */

/** FNV-1a 32-bit string hash. Deterministic across processes/platforms. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Combines a base seed with arbitrary extra context into one 32-bit seed. */
export function combineSeed(base: number, ...extra: unknown[]): number {
  const extraStr = extra.map((e) => JSON.stringify(e) ?? "undefined").join("|");
  return (base ^ hashString(extraStr)) >>> 0;
}

/** mulberry32: small, fast, deterministic PRNG. Returns a `() => [0,1)` generator. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
