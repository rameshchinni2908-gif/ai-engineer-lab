import { randomUUID } from "node:crypto";
import type { Dataset, EvalCase } from "@ail/shared";
import { parseCsv, toCsv } from "./csv.js";
import { unprocessableError } from "../../middleware/errors.js";

const RESERVED_COLUMNS = new Set(["id", "expected", "tags", "metadata"]);

/**
 * CSV convention (documented in-app, per contracts §4 M7):
 * header row columns are `id` (optional), `expected` (optional, JSON-parsed
 * if it looks like JSON else kept as a raw string), `tags` (optional,
 * `|`-separated), `metadata` (optional JSON object), and every OTHER column
 * becomes `input.<columnName>` on the resulting EvalCase.
 */
export function casesFromCsv(content: string): EvalCase[] {
  const rows = parseCsv(content);
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  if (!header) return [];

  return dataRows
    .filter((r) => r.some((cell) => cell.length > 0))
    .map((row) => {
      const input: Record<string, unknown> = {};
      let id = "";
      let expected: unknown;
      let tags: string[] = [];
      let metadata: Record<string, unknown> = {};

      header.forEach((col, idx) => {
        const value = row[idx] ?? "";
        if (col === "id") {
          id = value;
        } else if (col === "expected") {
          expected = tryParseJson(value);
        } else if (col === "tags") {
          tags = value
            .split("|")
            .map((t) => t.trim())
            .filter(Boolean);
        } else if (col === "metadata") {
          const parsed = value ? tryParseJson(value) : {};
          metadata = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
        } else {
          input[col] = value;
        }
      });

      return {
        id: id || `case_${randomUUID()}`,
        input,
        expected,
        tags,
        metadata,
      };
    });
}

/** Only attempts JSON parsing for values that LOOK like a JSON object/array/
 * boolean/null - a bare numeric-looking string (e.g. "4") stays a string, so
 * round-tripping a case through CSV export/import doesn't silently change an
 * `expected` exact-match answer's type. */
function tryParseJson(value: string): unknown {
  if (value === "") return undefined;
  const trimmed = value.trim();
  const looksLikeJson =
    trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed === "true" || trimmed === "false" || trimmed === "null";
  if (!looksLikeJson) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Inverse of `casesFromCsv`: every distinct `input` key across all cases becomes its own column. */
export function casesToCsv(cases: EvalCase[]): string {
  const inputKeys = new Set<string>();
  for (const c of cases) {
    for (const key of Object.keys(c.input)) {
      if (!RESERVED_COLUMNS.has(key)) inputKeys.add(key);
    }
  }
  const header = ["id", ...Array.from(inputKeys), "expected", "tags", "metadata"];
  const rows: string[][] = [header];
  for (const c of cases) {
    const row = header.map((col) => {
      if (col === "id") return c.id;
      if (col === "expected") return stringifyCell(c.expected);
      if (col === "tags") return (c.tags ?? []).join("|");
      if (col === "metadata") return Object.keys(c.metadata ?? {}).length > 0 ? JSON.stringify(c.metadata) : "";
      return stringifyCell(c.input[col]);
    });
    rows.push(row);
  }
  return toCsv(rows);
}

function stringifyCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function parseImportContent(format: "json" | "csv", content: string): EvalCase[] {
  if (format === "csv") return casesFromCsv(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw unprocessableError("Invalid JSON content for dataset import");
  }
  const candidate = Array.isArray(parsed) ? parsed : (parsed as { cases?: unknown }).cases;
  if (!Array.isArray(candidate)) {
    throw unprocessableError("JSON import content must be an array of cases, or an object with a `cases` array");
  }
  return candidate.map((c) => normalizeJsonCase(c));
}

function normalizeJsonCase(c: unknown): EvalCase {
  if (typeof c !== "object" || c === null) {
    throw unprocessableError("Each imported case must be an object");
  }
  const obj = c as Record<string, unknown>;
  return {
    id: typeof obj.id === "string" && obj.id.length > 0 ? obj.id : `case_${randomUUID()}`,
    input: (obj.input as Record<string, unknown>) ?? {},
    expected: obj.expected,
    tags: Array.isArray(obj.tags) ? (obj.tags as string[]) : [],
    metadata: (obj.metadata as Record<string, unknown>) ?? {},
  };
}

export function exportDataset(dataset: Dataset, format: "json" | "csv"): { body: string; contentType: string } {
  if (format === "csv") {
    return { body: casesToCsv(dataset.cases), contentType: "text/csv" };
  }
  return { body: JSON.stringify(dataset, null, 2), contentType: "application/json" };
}
