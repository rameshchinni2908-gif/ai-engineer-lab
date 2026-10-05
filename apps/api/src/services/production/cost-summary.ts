import { getDb } from "../../db/index.js";
import type { CostBreakdown, TokenUsage } from "@ail/shared";

export type CostSummaryGroupBy = "module" | "feature" | "model" | "providerId";

export interface CostSummaryFilter {
  groupBy: CostSummaryGroupBy;
  from?: string;
  to?: string;
}

export interface CostSummaryRow {
  key: string;
  totalCostUsd: number;
  totalTokens: number;
  runCount: number;
  avgLatencyMs: number;
}

const GROUP_COLUMN: Record<CostSummaryGroupBy, string> = {
  module: "module_id",
  feature: "feature",
  model: "model",
  providerId: "provider_id",
};

interface RunAggRow {
  group_key: string;
  cost: string;
  usage: string;
  latency_ms: number;
}

/**
 * `GET /production/cost-summary`: aggregates the real `runs` table (every
 * generation across every module persists one) by module/feature/model/
 * providerId - the "cost per feature" half of the tracing dashboard. The
 * span waterfall half reuses the shared `GET /traces` route directly per
 * contracts §4 M9's note (no duplicate trace route here).
 */
export async function getCostSummary(filter: CostSummaryFilter): Promise<{ rows: CostSummaryRow[] }> {
  const db = await getDb();
  const column = GROUP_COLUMN[filter.groupBy];

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.from) {
    clauses.push("created_at >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    clauses.push("created_at <= ?");
    params.push(filter.to);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const rows = db
    .prepare(`SELECT ${column} as group_key, cost, usage, latency_ms FROM runs ${where}`)
    .all(...params) as RunAggRow[];

  const byKey = new Map<string, { totalCostUsd: number; totalTokens: number; runCount: number; latencySum: number }>();
  for (const row of rows) {
    const cost = JSON.parse(row.cost) as CostBreakdown;
    const usage = JSON.parse(row.usage) as TokenUsage;
    const entry = byKey.get(row.group_key) ?? { totalCostUsd: 0, totalTokens: 0, runCount: 0, latencySum: 0 };
    entry.totalCostUsd += cost.totalCostUsd;
    entry.totalTokens += usage.totalTokens;
    entry.runCount += 1;
    entry.latencySum += row.latency_ms;
    byKey.set(row.group_key, entry);
  }

  const resultRows: CostSummaryRow[] = [...byKey.entries()]
    .map(([key, v]) => ({
      key,
      totalCostUsd: v.totalCostUsd,
      totalTokens: v.totalTokens,
      runCount: v.runCount,
      avgLatencyMs: v.runCount > 0 ? v.latencySum / v.runCount : 0,
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);

  return { rows: resultRows };
}
