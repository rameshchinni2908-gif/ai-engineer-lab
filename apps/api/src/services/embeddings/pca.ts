/**
 * Pure, from-scratch PCA projection to 2 dimensions, via power iteration +
 * deflation over the (small, dense) covariance matrix - no external linear
 * algebra dependency. Deterministic: fixed starting vectors and a fixed
 * iteration count mean the same input always yields the same output
 * (required for `project-2d`'s reproducibility and `pca.test.ts`).
 *
 * `method: "umap"` on the route falls back to this with a disclosed note -
 * a full UMAP implementation (stochastic graph layout) is out of scope for
 * this teaching app; see `docs/contracts.md` M4 `/embeddings/project-2d`.
 */

export interface Point2D {
  x: number;
  y: number;
}

const POWER_ITERATIONS = 200;
const DEGENERATE_NORM_EPS = 1e-9;

function matVec(matrix: number[][], v: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, val, j) => sum + val * v[j]!, 0));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i]!, 0);
}

function normalize(v: number[]): { unit: number[]; norm: number } {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norm < DEGENERATE_NORM_EPS) return { unit: v, norm: 0 };
  return { unit: v.map((x) => x / norm), norm };
}

/**
 * Dominant eigenvector/eigenvalue of a symmetric matrix via power iteration,
 * starting from a FIXED (non-random) seed vector so results are deterministic.
 * Degenerate (all-zero / rank-deficient) input returns eigenvalue 0 and the
 * seed vector unchanged, rather than producing NaNs.
 */
function powerIteration(matrix: number[][], seed: number[]): { vector: number[]; eigenvalue: number } {
  let v = normalize(seed).unit;
  for (let it = 0; it < POWER_ITERATIONS; it++) {
    const next = matVec(matrix, v);
    const { unit, norm } = normalize(next);
    if (norm < DEGENERATE_NORM_EPS) {
      return { vector: v, eigenvalue: 0 };
    }
    v = unit;
  }
  const eigenvalue = dot(matVec(matrix, v), v);
  return { vector: v, eigenvalue };
}

function covarianceMatrix(centered: number[][], dim: number): number[][] {
  const n = Math.max(centered.length, 1);
  const cov: number[][] = [];
  for (let i = 0; i < dim; i++) {
    const row: number[] = [];
    for (let j = 0; j < dim; j++) {
      let sum = 0;
      for (const vec of centered) {
        sum += (vec[i] ?? 0) * (vec[j] ?? 0);
      }
      row.push(sum / n);
    }
    cov.push(row);
  }
  return cov;
}

/** Fixed seed vector (all-ones, normalized) - deliberately not random so output is reproducible. */
function seedOnes(dim: number): number[] {
  return new Array(dim).fill(1);
}

/** Fixed alternating-sign seed, used for the SECOND component so it starts from a different direction than the first. */
function seedAlternating(dim: number): number[] {
  return new Array(dim).fill(0).map((_, i) => (i % 2 === 0 ? 1 : -1));
}

/**
 * Projects a set of equal-length vectors onto their top-2 principal
 * components. Pure and deterministic: same `vectors` input always produces
 * the same `Point2D[]` output (see `pca.test.ts`).
 */
export function projectPCA2D(vectors: number[][]): Point2D[] {
  const n = vectors.length;
  if (n === 0) return [];

  const dim = vectors[0]!.length;
  for (const v of vectors) {
    if (v.length !== dim) {
      throw new Error(`PCA input vectors must all share one dimension (got ${dim} and ${v.length})`);
    }
  }
  if (dim === 0) {
    throw new Error("PCA input vectors must have at least one dimension");
  }

  if (n === 1) {
    return [{ x: 0, y: 0 }];
  }

  const mean: number[] = [];
  for (let i = 0; i < dim; i++) {
    let sum = 0;
    for (const v of vectors) sum += v[i] ?? 0;
    mean.push(sum / n);
  }
  const centered = vectors.map((v) => v.map((x, i) => x - (mean[i] ?? 0)));

  const cov = covarianceMatrix(centered, dim);
  const { vector: pc1, eigenvalue: lambda1 } = powerIteration(cov, seedOnes(dim));

  // Deflate: remove the first component's contribution before extracting the second.
  const deflated = cov.map((row, i) => row.map((val, j) => val - lambda1 * pc1[i]! * pc1[j]!));
  const { vector: pc2raw } = powerIteration(deflated, seedAlternating(dim));

  // Guard against a degenerate/duplicate second axis (e.g. dim=1, or all
  // variance already captured by pc1): fall back to an arbitrary vector
  // orthogonal to pc1 rather than emitting NaN/garbage.
  const pc2 = Math.abs(dot(pc2raw, pc1)) > 1 - 1e-6 || magnitudeZero(pc2raw) ? orthogonalTo(pc1) : pc2raw;

  return centered.map((v) => ({ x: dot(v, pc1), y: dot(v, pc2) }));
}

function magnitudeZero(v: number[]): boolean {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0)) < DEGENERATE_NORM_EPS;
}

/** Deterministic vector orthogonal (or near-orthogonal) to `v`, used only as a last-resort fallback for a degenerate 2nd component. */
function orthogonalTo(v: number[]): number[] {
  const dim = v.length;
  if (dim < 2) return new Array(dim).fill(0);
  const out = new Array(dim).fill(0);
  out[0] = -(v[1] ?? 0);
  out[1] = v[0] ?? 0;
  return normalize(out).unit;
}
