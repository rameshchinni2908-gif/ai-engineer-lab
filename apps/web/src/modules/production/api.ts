import type { Message, ProviderId } from "@ail/shared";
import { apiFetch } from "@/lib/api";

export type CostSummaryGroupBy = "module" | "feature" | "model" | "providerId";
export interface CostSummaryRow {
  key: string;
  totalCostUsd: number;
  totalTokens: number;
  runCount: number;
  avgLatencyMs: number;
}

export type CacheType = "prompt" | "semantic" | "response";
export interface CacheSimResult {
  withoutCache: { totalCostUsd: number; totalLatencyMs: number };
  withCache: { totalCostUsd: number; totalLatencyMs: number };
  hits: number;
  misses: number;
  savingsPct: number;
  latencySavingsPct: number;
  assumedVsMeasuredNote: string;
}

export interface RoutingSimResult {
  assignments: { requestIndex: number; model: string; costUsd: number }[];
  totalCostUsd: number;
  baselineCostUsd: number;
}

export interface BatchingSimResult {
  unbatched: { totalCostUsd: number; totalLatencyMs: number; requestCount: number };
  batched: { totalCostUsd: number; totalLatencyMs: number; batchCount: number };
  savingsPct: number;
  latencySavingsPct: number;
}

export interface ContextTrimSimResult {
  untrimmed: { inputTokens: number; costUsd: number };
  trimmed: { inputTokens: number; costUsd: number; strategyApplied: string };
  savingsPct: number;
}

export type ReliabilityScenario =
  | "timeout"
  | "provider-down"
  | "rate-limited"
  | "duplicate-request"
  | "queue-backpressure";

export interface ReliabilityPolicy {
  maxRetries: number;
  backoffMs: number;
  fallbackProviderId?: ProviderId;
  circuitBreakerThreshold?: number;
  idempotencyKey?: string;
  queueConcurrency?: number;
}

export interface ReliabilitySimResult {
  attempts: { attempt: number; outcome: "success" | "fail" | "deduplicated" | "queued"; latencyMs: number }[];
  finalOutcome: "success" | "failed";
  totalLatencyMs: number;
  idempotencyKey?: string;
  queueDepthOverTime?: number[];
}

export interface LatencyLabPreset {
  id: string;
  name: string;
  providerId: ProviderId;
  model: string;
  params: Record<string, unknown>;
}

export const productionApi = {
  costSummary: (params: { groupBy: CostSummaryGroupBy; from?: string; to?: string }) =>
    apiFetch<{ rows: CostSummaryRow[] }>("/production/cost-summary", { query: params }),

  cacheSim: (body: {
    cacheType: CacheType;
    requests: { prompt: string }[];
    assumedHitRate?: number;
    providerId?: ProviderId;
    model?: string;
  }) => apiFetch<CacheSimResult>("/production/cache-sim", { method: "POST", body }),

  routingSim: (body: {
    requests: { prompt: string; complexity?: "low" | "high" }[];
    strategy: "cheapest" | "complexity-based" | "fallback-chain";
    candidateModels: string[];
  }) => apiFetch<RoutingSimResult>("/production/routing-sim", { method: "POST", body }),

  batchingSim: (body: { requests: { prompt: string }[]; batchSize: number; providerId: ProviderId; model: string }) =>
    apiFetch<BatchingSimResult>("/production/batching-sim", { method: "POST", body }),

  contextTrimSim: (body: {
    messages: Message[];
    providerId: ProviderId;
    model: string;
    strategy: "truncate-oldest" | "truncate-middle" | "sliding-window" | "summarize";
  }) => apiFetch<ContextTrimSimResult>("/production/context-trim-sim", { method: "POST", body }),

  reliabilitySim: (body: { scenario: ReliabilityScenario; policy: ReliabilityPolicy }) =>
    apiFetch<ReliabilitySimResult>("/production/reliability-sim", { method: "POST", body }),

  latencyPresets: () => apiFetch<{ presets: LatencyLabPreset[] }>("/production/latency-lab/presets"),
};
