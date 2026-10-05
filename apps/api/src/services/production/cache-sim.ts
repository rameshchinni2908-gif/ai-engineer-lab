import type { ProviderId } from "@ail/shared";
import { getProvider } from "../../providers/registry.js";
import { runGenerationOnce } from "../../services/runs/generation.js";
import { unprocessableError } from "../../middleware/errors.js";

export type CacheType = "prompt" | "semantic" | "response";

export interface CacheSimRequest {
  cacheType: CacheType;
  requests: { prompt: string }[];
  /** Accepted per contract but intentionally NOT used to compute the headline
   * savings numbers below - see `assumedVsMeasuredNote`. Reported back so the
   * UI can show the gap between what was assumed and what was measured. */
  assumedHitRate?: number;
  /** Not in the documented request table (which has no way to select a
   * provider/model) - defaults to the always-available mock provider so this
   * sim works with zero keys, per CLAUDE.md. Optional override for callers
   * who want to measure against a real configured provider. */
  providerId?: ProviderId;
  model?: string;
}

export interface CacheSimTotals {
  totalCostUsd: number;
  totalLatencyMs: number;
}

export interface CacheSimResult {
  withoutCache: CacheSimTotals;
  withCache: CacheSimTotals;
  hits: number;
  misses: number;
  savingsPct: number;
  /** Additive: with the (zero-key default) mock provider, per-token cost is
   * $0, so `savingsPct` is honestly 0 even though real latency was saved on
   * every hit - this surfaces that latency saving separately rather than
   * hiding it behind a cost metric that only moves for a paid provider. */
  latencySavingsPct: number;
  /** Disclosure per CLAUDE.md: never present an assumed number as authoritative. */
  assumedVsMeasuredNote: string;
}

/** Normalizes whitespace/case for the "response" cache's looser match. */
function normalizeForResponseCache(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  // Mock/embedding vectors from this app are already unit-normalized, but
  // compute the full cosine formula so this also works for a non-normalized
  // real provider's embeddings.
  const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0)) || 1;
  const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0)) || 1;
  return dot / (normA * normB);
}

const SEMANTIC_SIMILARITY_THRESHOLD = 0.92;

/**
 * `POST /production/cache-sim`. Runs `requests` through the provider for
 * real TWICE - once with no caching at all ("withoutCache", one provider
 * call per request) and once with the named cache type active ("withCache",
 * a provider call only on a genuine cache miss) - and reports the measured
 * totals, per CLAUDE.md's "measured savings" requirement. `assumedHitRate`
 * is echoed in `assumedVsMeasuredNote` for contrast, never used to compute
 * the headline numbers themselves.
 */
export async function runCacheSim(req: CacheSimRequest): Promise<CacheSimResult> {
  const providerId: ProviderId = req.providerId ?? "mock";
  const model = req.model ?? "mock-small";
  const provider = getProvider(providerId);

  if (req.cacheType === "semantic" && !provider.embed) {
    throw unprocessableError(
      `Provider ${providerId} does not implement embed(); semantic caching requires an embeddings-capable provider.`,
    );
  }

  // Pass 1: cold, no cache - one real provider call per request.
  let withoutCostUsd = 0;
  let withoutLatencyMs = 0;
  for (const r of req.requests) {
    const run = await runGenerationOnce({
      moduleId: "production",
      feature: "cache-sim-cold",
      providerId,
      model,
      messages: [{ role: "user", content: r.prompt }],
    });
    withoutCostUsd += run.cost.totalCostUsd;
    withoutLatencyMs += run.latencyMs;
  }

  // Pass 2: the named cache active - a real call only on a genuine miss.
  let withCostUsd = 0;
  let withLatencyMs = 0;
  let hits = 0;
  let misses = 0;

  const exactCache = new Map<string, true>();
  const semanticCache: number[][] = [];

  for (const r of req.requests) {
    let isHit = false;

    if (req.cacheType === "prompt") {
      isHit = exactCache.has(r.prompt);
    } else if (req.cacheType === "response") {
      isHit = exactCache.has(normalizeForResponseCache(r.prompt));
    } else {
      // semantic
      const [embedding] = await provider.embed!([r.prompt], model);
      isHit = semanticCache.some((cached) => cosineSimilarity(cached, embedding!) >= SEMANTIC_SIMILARITY_THRESHOLD);
      if (!isHit) semanticCache.push(embedding!);
    }

    if (isHit) {
      hits++;
      // A genuine cache hit makes no provider call: 0 added cost, 0 added
      // latency - not a fabricated "small positive" number.
      continue;
    }

    misses++;
    const run = await runGenerationOnce({
      moduleId: "production",
      feature: "cache-sim-warm",
      providerId,
      model,
      messages: [{ role: "user", content: r.prompt }],
    });
    withCostUsd += run.cost.totalCostUsd;
    withLatencyMs += run.latencyMs;

    if (req.cacheType === "prompt") exactCache.set(r.prompt, true);
    else if (req.cacheType === "response") exactCache.set(normalizeForResponseCache(r.prompt), true);
  }

  const savingsPct = withoutCostUsd > 0 ? ((withoutCostUsd - withCostUsd) / withoutCostUsd) * 100 : 0;
  const latencySavingsPct =
    withoutLatencyMs > 0 ? ((withoutLatencyMs - withLatencyMs) / withoutLatencyMs) * 100 : 0;

  const assumedNote =
    req.assumedHitRate !== undefined
      ? `An assumed ${(req.assumedHitRate * 100).toFixed(0)}% hit rate was supplied but NOT used to compute savings above; the measured hit rate from actually running these ${req.requests.length} requests twice was ${((hits / Math.max(req.requests.length, 1)) * 100).toFixed(0)}%. Compare the two - an assumed rate is a guess, this run's numbers are measured.`
      : `No assumed hit rate was supplied. The hit/miss counts and savings above come from actually running these ${req.requests.length} requests through the provider twice (cold vs. ${req.cacheType} cache active), not an assumed multiplier.`;

  return {
    withoutCache: { totalCostUsd: withoutCostUsd, totalLatencyMs: withoutLatencyMs },
    withCache: { totalCostUsd: withCostUsd, totalLatencyMs: withLatencyMs },
    hits,
    misses,
    savingsPct,
    latencySavingsPct,
    assumedVsMeasuredNote: assumedNote,
  };
}
