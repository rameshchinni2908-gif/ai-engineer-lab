/**
 * Small, dependency-free deterministic text utilities shared by the
 * `vector_search` tool, long-term (vector-backed) memory, and loop
 * detection's similarity check. Intentionally self-contained (no import
 * from `retrieval-engineer`'s `embeddings`/`vector` modules, which this
 * agent does not own and which may not exist yet in this wave) - see the
 * agent-engineer handoff notes for the coupling decision.
 */

const EMBED_DIM = 32;

function hashString(s: string): number {
  let h = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Deterministic hash-to-unit-vector embedding (feature-hashed bag of words). */
export function embedText(text: string, dim = EMBED_DIM): number[] {
  const vec = new Array<number>(dim).fill(0);
  for (const w of tokenize(text)) {
    const h1 = hashString(w);
    const h2 = hashString(`${w}#sign`);
    const idx = h1 % dim;
    const sign = h2 % 2 === 0 ? 1 : -1;
    vec[idx] = (vec[idx] ?? 0) + sign;
  }
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot; // vectors from embedText are already unit-norm
}

/** Jaccard token-overlap similarity (0..1) - cheap and intuitive for "is this step a near-repeat of that one". */
export function textSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

export { hashString };
