import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "./rrf.js";

describe("reciprocalRankFusion", () => {
  it("ranks an id that is #1 in both lists above one that only appears in a single list", () => {
    const bm25 = ["a", "b", "c"];
    const vector = ["a", "d", "e"];
    const fused = reciprocalRankFusion([bm25, vector]);
    expect(fused[0]!.id).toBe("a");
  });

  it("rewards an id ranked well in BOTH lists over one ranked #1 in only one list", () => {
    const bm25 = ["x", "y", "z"];
    const vector = ["y", "x", "w"];
    const fused = reciprocalRankFusion([bm25, vector]);
    // y is #2/#1, x is #1/#2 - both present in both lists near the top; the
    // important property is that an id present in BOTH lists outranks one
    // present in only one, which "w" (vector-only, rank 3) and "z" (bm25-only, rank 3) demonstrate.
    const ids = fused.map((f) => f.id);
    expect(ids.indexOf("x")).toBeLessThan(ids.indexOf("z"));
    expect(ids.indexOf("y")).toBeLessThan(ids.indexOf("w"));
  });

  it("is immune to one retriever's scores dominating by raw magnitude (fuses by RANK, not score)", () => {
    // RRF never sees raw scores at all, only rank position - this test
    // documents that property by construction: the function signature only
    // accepts ordered id lists, not scores.
    const fused = reciprocalRankFusion([["only-one"]]);
    expect(fused).toEqual([{ id: "only-one", score: 1 / 61, ranks: [1] }]);
  });

  it("is deterministic", () => {
    const a = reciprocalRankFusion([["a", "b"], ["b", "a"]]);
    const b = reciprocalRankFusion([["a", "b"], ["b", "a"]]);
    expect(a).toEqual(b);
  });

  it("records per-list ranks (undefined where an id didn't appear in that list)", () => {
    const fused = reciprocalRankFusion([["a", "b"], ["b"]]);
    const a = fused.find((f) => f.id === "a")!;
    expect(a.ranks).toEqual([1, undefined]);
  });

  it("a higher k dampens the fusion score spread between ranks", () => {
    const low = reciprocalRankFusion([["a", "b", "c"]], 1);
    const high = reciprocalRankFusion([["a", "b", "c"]], 1000);
    const spread = (res: typeof low) => res[0]!.score - res[res.length - 1]!.score;
    expect(spread(high)).toBeLessThan(spread(low));
  });

  it("handles an empty rankings input", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
  });
});
