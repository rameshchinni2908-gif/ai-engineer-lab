import type { VectorFilter } from "@ail/shared";

interface RangeSpec {
  gte?: number;
  lte?: number;
  gt?: number;
  lt?: number;
}

const RANGE_KEYS = ["gte", "lte", "gt", "lt"] as const;

function isRangeSpec(v: unknown): v is RangeSpec {
  return typeof v === "object" && v !== null && !Array.isArray(v) && RANGE_KEYS.some((k) => k in (v as object));
}

/**
 * Matches a point's metadata against a `VectorFilter`: each key is either an
 * exact-equality match, or - per the shared type's "equality/range" doc
 * comment - a range spec `{ gte?, lte?, gt?, lt? }` against a numeric field.
 */
export function matchesFilter(metadata: Record<string, unknown>, filter?: VectorFilter): boolean {
  if (!filter) return true;
  for (const [key, expected] of Object.entries(filter)) {
    const actual = metadata[key];
    if (isRangeSpec(expected)) {
      if (typeof actual !== "number") return false;
      if (expected.gte !== undefined && !(actual >= expected.gte)) return false;
      if (expected.lte !== undefined && !(actual <= expected.lte)) return false;
      if (expected.gt !== undefined && !(actual > expected.gt)) return false;
      if (expected.lt !== undefined && !(actual < expected.lt)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}
