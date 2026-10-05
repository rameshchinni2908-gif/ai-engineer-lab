import { describe, expect, it } from "vitest";
import type { EvalCase } from "@ail/shared";
import { casesFromCsv, casesToCsv, parseImportContent } from "./importExport.js";

describe("CSV dataset import/export round-trip", () => {
  const cases: EvalCase[] = [
    {
      id: "case-1",
      input: { prompt: "What is 2+2?", context: "simple math" },
      expected: "4",
      tags: ["math", "easy"],
      metadata: {},
    },
    {
      id: "case-2",
      input: { prompt: 'Say "hello", then stop.', context: "quotes, commas" },
      expected: "hello",
      tags: [],
      metadata: { note: "has quotes and commas" },
    },
    {
      id: "case-3",
      input: { prompt: "multi\nline\nprompt", context: "" },
      expected: undefined,
      tags: ["edge"],
      metadata: {},
    },
  ];

  it("round-trips cases through casesToCsv -> casesFromCsv", () => {
    const csv = casesToCsv(cases);
    const parsed = casesFromCsv(csv);
    expect(parsed).toHaveLength(cases.length);
    expect(parsed[0]).toMatchObject({
      id: "case-1",
      input: { prompt: "What is 2+2?", context: "simple math" },
      expected: "4",
      tags: ["math", "easy"],
    });
    expect(parsed[1]!.input.prompt).toBe('Say "hello", then stop.');
    expect(parsed[1]!.input.context).toBe("quotes, commas");
    expect(parsed[1]!.metadata).toEqual({ note: "has quotes and commas" });
    expect(parsed[2]!.input.prompt).toBe("multi\nline\nprompt");
  });

  it("auto-generates an id when the CSV id column is blank", () => {
    const csv = "id,prompt,expected\n,hi,hello";
    const parsed = casesFromCsv(csv);
    expect(parsed[0]!.id).toBeTruthy();
    expect(parsed[0]!.input.prompt).toBe("hi");
  });

  it("parses pipe-separated tags", () => {
    const csv = "id,prompt,tags\nc1,hi,a|b|c";
    const parsed = casesFromCsv(csv);
    expect(parsed[0]!.tags).toEqual(["a", "b", "c"]);
  });
});

describe("JSON dataset import", () => {
  it("accepts a bare array of cases", () => {
    const cases = parseImportContent(
      "json",
      JSON.stringify([{ input: { prompt: "hi" }, expected: "hello" }]),
    );
    expect(cases).toHaveLength(1);
    expect(cases[0]!.input.prompt).toBe("hi");
    expect(cases[0]!.id).toBeTruthy();
  });

  it("accepts { cases: [...] } wrapper shape", () => {
    const cases = parseImportContent(
      "json",
      JSON.stringify({ cases: [{ id: "c1", input: { prompt: "hi" }, expected: "hello", tags: [], metadata: {} }] }),
    );
    expect(cases).toEqual([{ id: "c1", input: { prompt: "hi" }, expected: "hello", tags: [], metadata: {} }]);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseImportContent("json", "{not json")).toThrow();
  });
});
