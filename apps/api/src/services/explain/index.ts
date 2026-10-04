import type { Difficulty, ExplainRunResponse, Run } from "@ail/shared";
import { conflictError, notFoundError } from "../../middleware/errors.js";
import { getRun } from "../runs/store.js";
import { buildFactors, buildSummary, buildWhatToTryNext } from "./factors.js";

export { computeLogprobStats } from "./factors.js";

const ALL_DIFFICULTIES: Difficulty[] = ["beginner", "intermediate", "senior"];

export interface ExplainRunArgs {
  runId: string;
  difficulty?: Difficulty;
  comparisonRunId?: string;
}

/**
 * `POST /explain-run`: derives `ExplainRunResponse` entirely from the real,
 * persisted `Run` (and optional comparison `Run`) - every factor cites
 * concrete numbers from that specific run (contracts §7). Works identically
 * for Mock-provider runs: Mock's logprobs are mathematically real (see
 * `providers/sampling.ts`), so the same factor-building logic applies.
 */
export async function explainRun(args: ExplainRunArgs): Promise<ExplainRunResponse> {
  const run = await getRun(args.runId);
  if (!run) throw notFoundError(`Run ${args.runId} not found`);
  if (run.status !== "complete" && run.status !== "error") {
    throw conflictError(`Run ${args.runId} is still ${run.status}; explain-run requires a finished run.`);
  }

  const comparison = args.comparisonRunId ? await getRun(args.comparisonRunId) : undefined;
  if (args.comparisonRunId && !comparison) {
    throw notFoundError(`Comparison run ${args.comparisonRunId} not found`);
  }

  const difficulty = args.difficulty ?? "intermediate";
  const factors = buildFactors(run, comparison);
  const whatToTryNext = buildWhatToTryNext(run);
  const summary = buildSummary(run, difficulty, factors);
  const variants = Object.fromEntries(
    ALL_DIFFICULTIES.map((d) => [d, buildSummary(run, d, factors)]),
  ) as Record<Difficulty, string>;

  return { runId: run.id, summary, factors, whatToTryNext, variants };
}

/** Exposed for tests/other services that already hold a `Run` and want to skip the DB round-trip. */
export function explainRunFromData(
  run: Run,
  difficulty: Difficulty = "intermediate",
  comparison?: Run,
): ExplainRunResponse {
  const factors = buildFactors(run, comparison);
  const whatToTryNext = buildWhatToTryNext(run);
  const summary = buildSummary(run, difficulty, factors);
  const variants = Object.fromEntries(
    ALL_DIFFICULTIES.map((d) => [d, buildSummary(run, d, factors)]),
  ) as Record<Difficulty, string>;
  return { runId: run.id, summary, factors, whatToTryNext, variants };
}
