import { describe, expect, it } from "vitest";
import {
  computeSimilarity,
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
  isHigherBetter,
} from "./similarity.js";

describe("similarity metrics", () => {
  it("cosine similarity of identical vectors is 1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });

  it("cosine similarity of orthogonal vectors is 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("cosine similarity of opposite vectors is -1", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  it("cosine similarity is magnitude-invariant (normalization matters)", () => {
    const a = [3, 4];
    const bSmall = [0.3, 0.4];
    const bLarge = [30, 40];
    expect(cosineSimilarity(a, bSmall)).toBeCloseTo(cosineSimilarity(a, bLarge), 10);
  });

  it("dot product IS magnitude-sensitive, unlike cosine", () => {
    const a = [1, 0];
    const bSmall = [1, 0];
    const bLarge = [10, 0];
    expect(dotProduct(a, bSmall)).not.toBeCloseTo(dotProduct(a, bLarge), 5);
  });

  it("euclidean distance of identical vectors is 0", () => {
    expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it("euclidean distance matches pythagorean theorem in 2D", () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBeCloseTo(5, 10);
  });

  it("throws on dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/dimension mismatch/);
  });

  it("cosine/dot vs euclidean can rank candidates differently (metric choice matters)", () => {
    // query is a unit vector; candidate A is a scaled-down near-duplicate (far in
    // euclidean space despite near-perfect cosine similarity), candidate B is a
    // different direction but geometrically closer in raw euclidean terms.
    const query = [1, 0];
    const candidateA = [0.1, 0]; // same direction, small magnitude
    const candidateB = [0.9, 0.3]; // different direction, large magnitude

    const cosA = cosineSimilarity(query, candidateA);
    const cosB = cosineSimilarity(query, candidateB);
    const eucA = euclideanDistance(query, candidateA);
    const eucB = euclideanDistance(query, candidateB);

    expect(cosA).toBeGreaterThan(cosB); // cosine prefers A (same direction)
    expect(eucA).toBeGreaterThan(eucB); // euclidean prefers B (closer in raw space) - A is worse (farther)
  });

  it("isHigherBetter is false only for euclidean", () => {
    expect(isHigherBetter("cosine")).toBe(true);
    expect(isHigherBetter("dot")).toBe(true);
    expect(isHigherBetter("euclidean")).toBe(false);
  });

  it("computeSimilarity dispatches to the correct metric", () => {
    expect(computeSimilarity([1, 0], [1, 0], "cosine")).toBeCloseTo(1, 10);
    expect(computeSimilarity([2, 0], [3, 0], "dot")).toBeCloseTo(6, 10);
    expect(computeSimilarity([0, 0], [3, 4], "euclidean")).toBeCloseTo(5, 10);
  });

  it("rejects zero-length vectors", () => {
    expect(() => cosineSimilarity([], [])).toThrow();
  });
});
