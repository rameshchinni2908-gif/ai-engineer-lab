import type { ProviderId } from "@ail/shared";
import { runGenerationOnce } from "../../services/runs/generation.js";
import { validationError } from "../../middleware/errors.js";

export interface BatchingSimRequest {
  requests: { prompt: string }[];
  batchSize: number;
  providerId: ProviderId;
  model: string;
}

export interface BatchingSimResult {
  unbatched: { totalCostUsd: number; totalLatencyMs: number; requestCount: number };
  batched: { totalCostUsd: number; totalLatencyMs: number; batchCount: number };
  savingsPct: number;
  /** Additive: see cache-sim's identical field for why this is reported
   * alongside a cost-based `savingsPct` that is honestly 0 for free/mock models. */
  latencySavingsPct: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

function buildBatchPrompt(prompts: string[]): string {
  return [
    "Answer each numbered question concisely, one answer per number:",
    ...prompts.map((p, i) => `${i + 1}. ${p}`),
  ].join("\n");
}

/**
 * `POST /production/batching-sim`. 3rd CLAUDE.md cost lever. Issues one REAL
 * provider call per request ("unbatched") vs. one REAL provider call per
 * `batchSize`-sized group ("batched", requests concatenated into a single
 * numbered prompt) and reports the measured totals - the amortized per-call
 * overhead (and, for a real provider, the per-request base latency) is what
 * batching actually saves, so this has to be measured by issuing the real
 * calls rather than assumed.
 */
export async function runBatchingSim(req: BatchingSimRequest): Promise<BatchingSimResult> {
  if (req.batchSize < 1) throw validationError("batchSize must be >= 1");

  let unbatchedCostUsd = 0;
  let unbatchedLatencyMs = 0;
  for (const r of req.requests) {
    const run = await runGenerationOnce({
      moduleId: "production",
      feature: "batching-sim-unbatched",
      providerId: req.providerId,
      model: req.model,
      messages: [{ role: "user", content: r.prompt }],
    });
    unbatchedCostUsd += run.cost.totalCostUsd;
    unbatchedLatencyMs += run.latencyMs;
  }

  const groups = chunk(req.requests, req.batchSize);
  let batchedCostUsd = 0;
  let batchedLatencyMs = 0;
  for (const group of groups) {
    const run = await runGenerationOnce({
      moduleId: "production",
      feature: "batching-sim-batched",
      providerId: req.providerId,
      model: req.model,
      messages: [{ role: "user", content: buildBatchPrompt(group.map((g) => g.prompt)) }],
    });
    batchedCostUsd += run.cost.totalCostUsd;
    batchedLatencyMs += run.latencyMs;
  }

  const savingsPct =
    unbatchedCostUsd > 0 ? ((unbatchedCostUsd - batchedCostUsd) / unbatchedCostUsd) * 100 : 0;
  const latencySavingsPct =
    unbatchedLatencyMs > 0 ? ((unbatchedLatencyMs - batchedLatencyMs) / unbatchedLatencyMs) * 100 : 0;

  return {
    unbatched: {
      totalCostUsd: unbatchedCostUsd,
      totalLatencyMs: unbatchedLatencyMs,
      requestCount: req.requests.length,
    },
    batched: { totalCostUsd: batchedCostUsd, totalLatencyMs: batchedLatencyMs, batchCount: groups.length },
    savingsPct,
    latencySavingsPct,
  };
}
