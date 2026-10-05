import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv.js";

describe("parseCsv", () => {
  it("parses simple comma-separated rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCsv('a,b\n"hello, world",2')).toEqual([
      ["a", "b"],
      ["hello, world", "2"],
    ]);
  });

  it("handles doubled-quote escaping inside quoted fields", () => {
    expect(parseCsv('a\n"she said ""hi"""')).toEqual([["a"], ['she said "hi"']]);
  });

  it("handles embedded newlines inside quoted fields", () => {
    expect(parseCsv('a,b\n"line1\nline2",x')).toEqual([
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("ignores a single trailing newline (no phantom empty row)", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserves empty fields", () => {
    expect(parseCsv("a,b,c\n,2,")).toEqual([
      ["a", "b", "c"],
      ["", "2", ""],
    ]);
  });
});

describe("toCsv", () => {
  it("quotes fields that need it and leaves plain fields unquoted", () => {
    expect(toCsv([["a", "b"], ["hello, world", "plain"]])).toBe(
      'a,b\r\n"hello, world",plain',
    );
  });

  it("escapes embedded quotes by doubling them", () => {
    expect(toCsv([['she said "hi"']])).toBe('"she said ""hi"""');
  });
});

describe("CSV round-trip safety", () => {
  const awkwardRows: string[][] = [
    ["id", "prompt", "expected", "tags"],
    ["case-1", "simple text", "ok", "smoke"],
    ["case-2", "has, a comma", 'has "quotes" too', "a|b"],
    ["case-3", "multi\nline\nvalue", "unicode: café 日本語 🎉", ""],
    ["case-4", "", "trailing,comma,", "x,y,z"],
    ["case-5", "  leading/trailing space  ", "tab\there", "s"],
  ];

  it("round-trips arbitrary awkward fields through toCsv -> parseCsv unchanged", () => {
    const csv = toCsv(awkwardRows);
    const parsed = parseCsv(csv);
    expect(parsed).toEqual(awkwardRows);
  });
});
