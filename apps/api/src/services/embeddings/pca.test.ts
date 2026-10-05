import { describe, expect, it } from "vitest";
import { projectPCA2D } from "./pca.js";

describe("projectPCA2D", () => {
  it("returns an empty array for no input", () => {
    expect(projectPCA2D([])).toEqual([]);
  });

  it("returns a single origin point for one vector", () => {
    expect(projectPCA2D([[1, 2, 3, 4]])).toEqual([{ x: 0, y: 0 }]);
  });

  it("is deterministic: identical input always yields identical output", () => {
    const vectors = [
      [1, 0, 0.2, 0.9],
      [0.9, 0.1, 0.3, 0.8],
      [0, 1, -0.5, 0.1],
      [-1, -1, 0.4, -0.2],
      [0.5, 0.5, 0.5, 0.5],
    ];
    const first = projectPCA2D(vectors);
    const second = projectPCA2D(vectors.map((v) => [...v])); // fresh array identity, same values
    expect(second).toEqual(first);
  });

  it("separates two well-separated clusters along x", () => {
    const clusterA = [
      [0, 0],
      [0.1, -0.1],
      [-0.1, 0.1],
    ];
    const clusterB = [
      [10, 0],
      [10.1, 0.1],
      [9.9, -0.1],
    ];
    const points = projectPCA2D([...clusterA, ...clusterB]);
    const avgAx = (points[0]!.x + points[1]!.x + points[2]!.x) / 3;
    const avgBx = (points[3]!.x + points[4]!.x + points[5]!.x) / 3;
    expect(Math.abs(avgAx - avgBx)).toBeGreaterThan(5);
  });

  it("handles zero-variance input (all identical vectors) without NaN", () => {
    const points = projectPCA2D([
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ]);
    for (const p of points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("handles 1-dimensional input vectors without a degenerate 2nd axis producing NaN", () => {
    const points = projectPCA2D([[1], [2], [3], [-5]]);
    for (const p of points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("throws on mismatched vector dimensions", () => {
    expect(() => projectPCA2D([[1, 2], [1, 2, 3]])).toThrow(/dimension/);
  });

  it("preserves relative ordering of points along the dominant axis", () => {
    // A 1D line embedded in 2D space - PCA's first component should recover the ordering.
    const points = projectPCA2D([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    const xs = points.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    const isMonotonic = xs.every((v, i) => v === sorted[i] || v === sorted.slice().reverse()[i]);
    expect(isMonotonic).toBe(true);
  });
});
