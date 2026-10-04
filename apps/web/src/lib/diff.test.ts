import { describe, expect, it } from "vitest";
import { diffFields, diffWords } from "./diff";

describe("diffWords", () => {
  it("returns a single `same` token for identical text", () => {
    const tokens = diffWords("the quick fox", "the quick fox");
    expect(tokens).toEqual([{ op: "same", text: "the quick fox" }]);
  });

  it("detects a word replaced in the middle", () => {
    const tokens = diffWords("the quick fox", "the slow fox");
    // same "the ", remove "quick", add "slow", same " fox"
    expect(tokens.map((t) => t.op)).toEqual(["same", "remove", "add", "same"]);
    expect(tokens.find((t) => t.op === "remove")?.text).toBe("quick");
    expect(tokens.find((t) => t.op === "add")?.text).toBe("slow");
  });

  it("detects pure additions and removals", () => {
    const added = diffWords("hello", "hello world");
    expect(added.some((t) => t.op === "add" && t.text.includes("world"))).toBe(true);

    const removed = diffWords("hello world", "hello");
    expect(removed.some((t) => t.op === "remove" && t.text.includes("world"))).toBe(true);
  });

  it("handles empty strings on either side", () => {
    expect(diffWords("", "new text")).toEqual([{ op: "add", text: "new text" }]);
    expect(diffWords("old text", "")).toEqual([{ op: "remove", text: "old text" }]);
    expect(diffWords("", "")).toEqual([]);
  });
});

describe("diffFields", () => {
  it("flags only the fields that actually differ", () => {
    const result = diffFields({ a: 1, b: "x" }, { a: 1, b: "y" });
    const byField = Object.fromEntries(result.map((r) => [r.field, r]));
    expect(byField.a?.changed).toBe(false);
    expect(byField.b?.changed).toBe(true);
    expect(byField.b?.aValue).toBe("x");
    expect(byField.b?.bValue).toBe("y");
  });

  it("includes keys present in only one side", () => {
    const result = diffFields({ onlyInA: 1 }, { onlyInB: 2 });
    const fields = result.map((r) => r.field);
    expect(fields).toContain("onlyInA");
    expect(fields).toContain("onlyInB");
  });

  it("compares objects/arrays by deep value, not reference", () => {
    const result = diffFields({ nested: { x: 1 } }, { nested: { x: 1 } });
    expect(result[0]?.changed).toBe(false);
  });
});
