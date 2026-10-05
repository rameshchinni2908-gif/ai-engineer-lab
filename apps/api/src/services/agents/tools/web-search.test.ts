import { describe, expect, it } from "vitest";
import { runWebSearch } from "./web-search.js";

describe("web_search tool", () => {
  it("returns deterministic results for the same query across calls", async () => {
    const a = await runWebSearch({ query: "loop detection" });
    const b = await runWebSearch({ query: "loop detection" });
    expect(a.content).toBe(b.content);
    expect(a.isError).toBe(false);
  });

  it("ranks by keyword relevance", async () => {
    const outcome = await runWebSearch({ query: "sandbox memory cap" });
    const parsed = JSON.parse(outcome.content) as { results: { title: string }[] };
    expect(parsed.results.length).toBeGreaterThan(0);
    expect(parsed.results[0]!.title.toLowerCase()).toContain("sandbox");
  });

  it("rejects a missing query argument", async () => {
    const outcome = await runWebSearch({});
    expect(outcome.isError).toBe(true);
  });
});
