/**
 * Public service API for the `runs` domain. This is the surface Wave-2
 * module agents call (see `docs/backend-api.md`) - routes/services in other
 * modules should import from here rather than reaching into `store.ts`/
 * `tracing.ts`/`generation.ts` directly.
 */
import type { Run } from "@ail/shared";
import { notFoundError } from "../../middleware/errors.js";
import { getRun as getRunRow } from "./store.js";
import { diffRuns, type RunDiffEntry } from "./diff.js";

export * from "./tokenizer.js";
export * from "./store.js";
export * from "./tracing.js";
export * from "./generation.js";
export { diffRuns, type RunDiffEntry } from "./diff.js";

export interface CompareRunsResult {
  a: Run;
  b: Run;
  diff: RunDiffEntry[];
}

/** `GET /runs/compare?a=&b=`: fetches both runs and computes their field-path diff. */
export async function compareRuns(aId: string, bId: string): Promise<CompareRunsResult> {
  const [a, b] = await Promise.all([getRunRow(aId), getRunRow(bId)]);
  if (!a) throw notFoundError(`Run ${aId} not found`);
  if (!b) throw notFoundError(`Run ${bId} not found`);
  return { a, b, diff: diffRuns(a, b) };
}
