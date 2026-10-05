import { findModel, type ModelInfo } from "@ail/shared";
import { runGenerationOnce } from "../../services/runs/generation.js";
import { validationError } from "../../middleware/errors.js";

export type RoutingStrategy = "cheapest" | "complexity-based" | "fallback-chain";

export interface RoutingSimRequest {
  requests: { prompt: string; complexity?: "low" | "high" }[];
  strategy: RoutingStrategy;
  candidateModels: string[];
}

export interface RoutingAssignment {
  requestIndex: number;
  model: string;
  costUsd: number;
}

export interface RoutingSimResult {
  assignments: RoutingAssignment[];
  totalCostUsd: number;
  baselineCostUsd: number;
}

function resolveModels(candidateModels: string[]): ModelInfo[] {
  const resolved = candidateModels.map((id) => findModel(id));
  const missingIdx = resolved.findIndex((m) => m === undefined);
  if (missingIdx !== -1) {
    throw validationError(
      `candidateModels[${missingIdx}] "${candidateModels[missingIdx]}" is not in the model catalog.`,
    );
  }
  return resolved as ModelInfo[];
}

/** Combined per-token rate used purely to RANK candidates cheapest->priciest; actual cost is always measured per-request via a real call, never estimated from this ranking. */
function combinedRate(m: ModelInfo): number {
  return m.inputCostPerMTok + m.outputCostPerMTok;
}

/** Longer prompts are treated as a proxy for "harder" in the fallback-chain heuristic (documented as a heuristic, not a real difficulty classifier). */
const FALLBACK_ESCALATION_TOKEN_THRESHOLD = 40;

function pickModelForRequest(
  strategy: RoutingStrategy,
  request: { prompt: string; complexity?: "low" | "high" },
  sortedByCost: ModelInfo[],
): ModelInfo {
  const cheapest = sortedByCost[0]!;
  const priciest = sortedByCost[sortedByCost.length - 1]!;

  if (strategy === "cheapest") return cheapest;

  if (strategy === "complexity-based") {
    return request.complexity === "high" ? priciest : cheapest;
  }

  // fallback-chain: start cheap, escalate up the (cost-sorted) chain when the
  // request looks harder than the cheapest model would handle well.
  const approxWordCount = request.prompt.trim().split(/\s+/).filter(Boolean).length;
  if (approxWordCount <= FALLBACK_ESCALATION_TOKEN_THRESHOLD) return cheapest;
  const mid = Math.min(sortedByCost.length - 1, 1);
  return sortedByCost[mid]!;
}

/**
 * `POST /production/routing-sim`. Per CLAUDE.md's "measured savings"
 * requirement (applies to all four cost levers, not just caching/batching),
 * this makes a REAL provider call for every request's assigned model AND a
 * real provider call for every request against the single most expensive
 * candidate model (the `baselineCostUsd` comparison) - so both numbers are
 * measured, not derived from an estimated-token multiplier.
 */
export async function runRoutingSim(req: RoutingSimRequest): Promise<RoutingSimResult> {
  const models = resolveModels(req.candidateModels);
  const sortedByCost = [...models].sort((a, b) => combinedRate(a) - combinedRate(b));
  const priciest = sortedByCost[sortedByCost.length - 1]!;

  const assignments: RoutingAssignment[] = [];
  let totalCostUsd = 0;
  let baselineCostUsd = 0;

  for (let i = 0; i < req.requests.length; i++) {
    const request = req.requests[i]!;
    const chosen = pickModelForRequest(req.strategy, request, sortedByCost);

    const assignedRun = await runGenerationOnce({
      moduleId: "production",
      feature: "routing-sim",
      providerId: chosen.providerId,
      model: chosen.id,
      messages: [{ role: "user", content: request.prompt }],
    });
    assignments.push({ requestIndex: i, model: chosen.id, costUsd: assignedRun.cost.totalCostUsd });
    totalCostUsd += assignedRun.cost.totalCostUsd;

    const baselineRun = await runGenerationOnce({
      moduleId: "production",
      feature: "routing-sim-baseline",
      providerId: priciest.providerId,
      model: priciest.id,
      messages: [{ role: "user", content: request.prompt }],
    });
    baselineCostUsd += baselineRun.cost.totalCostUsd;
  }

  return { assignments, totalCostUsd, baselineCostUsd };
}
