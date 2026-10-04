import type { Run } from "@ail/shared";

export interface RunDiffEntry {
  field: string;
  aValue: unknown;
  bValue: unknown;
}

function flatten(obj: unknown, prefix: string, out: Record<string, unknown>): void {
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out[prefix] = obj;
  }
}

/** Pure: computes a field-path diff between two runs over params/usage/cost/latencyMs/output.text, per contracts §3. */
export function diffRuns(a: Run, b: Run): RunDiffEntry[] {
  const aFlat: Record<string, unknown> = {};
  const bFlat: Record<string, unknown> = {};
  flatten(a.params, "params", aFlat);
  flatten(b.params, "params", bFlat);
  flatten(a.usage, "usage", aFlat);
  flatten(b.usage, "usage", bFlat);
  flatten(a.cost, "cost", aFlat);
  flatten(b.cost, "cost", bFlat);
  aFlat["latencyMs"] = a.latencyMs;
  bFlat["latencyMs"] = b.latencyMs;
  aFlat["output.text"] = a.output.text;
  bFlat["output.text"] = b.output.text;

  const fields = new Set([...Object.keys(aFlat), ...Object.keys(bFlat)]);
  const entries: RunDiffEntry[] = [];
  for (const field of fields) {
    const aValue = aFlat[field];
    const bValue = bFlat[field];
    if (JSON.stringify(aValue) !== JSON.stringify(bValue)) {
      entries.push({ field, aValue, bValue });
    }
  }
  return entries.sort((x, y) => x.field.localeCompare(y.field));
}
