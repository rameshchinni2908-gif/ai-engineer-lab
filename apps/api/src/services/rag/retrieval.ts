import type { ProviderId, RetrievalDebug, RetrievalResult, RetrievalStage } from "@ail/shared";
import { reciprocalRankFusion } from "../vector/rrf.js";
import {
  generateHypotheticalAnswer,
  generateQueryVariants,
  hitToResult,
  rewriteQuery,
  vectorRetrieve,
} from "./retrieval-core.js";
import { compressResults, expandToParentContext } from "./retrieval-transforms.js";

export type RagStrategy =
  | "basic"
  | "query-rewrite"
  | "hyde"
  | "multi-query"
  | "parent-doc"
  | "compression"
  | "agentic";

export interface RetrieveArgs {
  query: string;
  collection: string;
  topK: number;
  providerId: ProviderId;
  model: string;
  strategy: RagStrategy;
  parentRunId?: string;
  traceId?: string;
  /** Fires once per pipeline stage so the caller (the SSE route) can emit `stage` events as retrieval progresses. */
  onStage?: (stage: string, data: unknown) => void;
}

export interface RetrieveOutcome {
  results: RetrievalResult[];
  debug: RetrievalDebug;
}

function buildDebug(query: string, rewrittenQueries: string[], stages: RetrievalStage[], totalStart: number): RetrievalDebug {
  return { query, rewrittenQueries, stages, totalTimingMs: Date.now() - totalStart };
}

const AGENTIC_MAX_ROUNDS = 3;
const AGENTIC_SCORE_THRESHOLD = 0.25;

async function agenticRetrieve(args: RetrieveArgs, stages: RetrievalStage[], totalStart: number): Promise<RetrieveOutcome> {
  let currentQuery = args.query;
  const rewrittenQueries: string[] = [];
  const bestByChunk = new Map<string, RetrievalResult>();

  for (let round = 1; round <= AGENTIC_MAX_ROUNDS; round++) {
    const start = Date.now();
    const { hits } = await vectorRetrieve(currentQuery, args.collection, args.topK, args.providerId, args.model);
    const results = hits.map((h, i) => hitToResult(h, "vector", i));
    for (const r of results) {
      const prev = bestByChunk.get(r.chunkId);
      if (!prev || r.score > prev.score) bestByChunk.set(r.chunkId, r);
    }
    stages.push({ stage: `agentic.round.${round}`, candidates: results, timingMs: Date.now() - start });
    args.onStage?.("agentic", { round, maxRounds: AGENTIC_MAX_ROUNDS, candidates: results });

    const topScore = results[0]?.score ?? 0;
    const enough = topScore >= AGENTIC_SCORE_THRESHOLD || round === AGENTIC_MAX_ROUNDS;
    if (enough) break;

    const { text } = await rewriteQuery(currentQuery, { providerId: args.providerId, model: args.model, parentRunId: args.parentRunId, traceId: args.traceId });
    currentQuery = text;
    rewrittenQueries.push(text);
  }

  const results = [...bestByChunk.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, args.topK)
    .map((r, i) => ({ ...r, rank: i }));
  return { results, debug: buildDebug(args.query, rewrittenQueries, stages, totalStart) };
}

async function multiQueryRetrieve(args: RetrieveArgs, stages: RetrievalStage[], totalStart: number): Promise<RetrieveOutcome> {
  const rewriteStart = Date.now();
  const variants = await generateQueryVariants(
    args.query,
    { providerId: args.providerId, model: args.model, parentRunId: args.parentRunId, traceId: args.traceId },
    3,
  );
  stages.push({ stage: "rewrite", candidates: [], timingMs: Date.now() - rewriteStart });
  args.onStage?.("rewrite", { rewrittenQueries: variants });

  const retrieveStart = Date.now();
  const perVariant = await Promise.all(
    variants.map((v) => vectorRetrieve(v, args.collection, args.topK * 2, args.providerId, args.model)),
  );
  const rankings = perVariant.map((r) => r.hits.map((h) => h.id));
  const fused = reciprocalRankFusion(rankings);

  const hitById = new Map<string, (typeof perVariant)[number]["hits"][number]>();
  for (const { hits } of perVariant) for (const h of hits) if (!hitById.has(h.id)) hitById.set(h.id, h);

  const results = fused
    .slice(0, args.topK)
    .map((f, i) => hitToResult(hitById.get(f.id)!, "vector", i, f.score));
  stages.push({ stage: "retrieve", candidates: results, timingMs: Date.now() - retrieveStart });
  args.onStage?.("retrieve", { candidates: results });

  return { results, debug: buildDebug(args.query, variants, stages, totalStart) };
}

/**
 * Dispatches to the requested RAG retrieval strategy. Each strategy targets
 * a specific failure mode (see `apps/web/src/content/modules/rag.ts`'s Learn
 * content): query-rewrite/HyDE address terse/mismatched queries, multi-query
 * addresses single-phrasing misses, parent-doc addresses too-small context,
 * compression addresses lost-in-the-middle dilution, agentic adds a bounded
 * retry loop when the first pass scores too low.
 */
export async function retrieve(args: RetrieveArgs): Promise<RetrieveOutcome> {
  const totalStart = Date.now();
  const stages: RetrievalStage[] = [];

  if (args.strategy === "multi-query") return multiQueryRetrieve(args, stages, totalStart);
  if (args.strategy === "agentic") return agenticRetrieve(args, stages, totalStart);

  let effectiveQuery = args.query;
  let rewrittenQueries: string[] = [];

  if (args.strategy === "query-rewrite" || args.strategy === "hyde") {
    const start = Date.now();
    const deps = { providerId: args.providerId, model: args.model, parentRunId: args.parentRunId, traceId: args.traceId };
    const { text } = args.strategy === "hyde" ? await generateHypotheticalAnswer(args.query, deps) : await rewriteQuery(args.query, deps);
    effectiveQuery = text;
    rewrittenQueries = [text];
    stages.push({ stage: "rewrite", candidates: [], timingMs: Date.now() - start });
    args.onStage?.("rewrite", { rewrittenQueries });
  }

  const retrieveStart = Date.now();
  const { hits } = await vectorRetrieve(effectiveQuery, args.collection, args.topK, args.providerId, args.model);
  let results = hits.map((h, i) => hitToResult(h, "vector", i));
  stages.push({ stage: "retrieve", candidates: results, timingMs: Date.now() - retrieveStart });
  args.onStage?.("retrieve", { candidates: results });

  if (args.strategy === "parent-doc") {
    const start = Date.now();
    results = await expandToParentContext(results);
    stages.push({ stage: "expand-context", candidates: results, timingMs: Date.now() - start });
    args.onStage?.("expand-context", { candidates: results });
  }

  if (args.strategy === "compression") {
    const start = Date.now();
    results = compressResults(results, args.query);
    stages.push({ stage: "compress", candidates: results, timingMs: Date.now() - start });
    args.onStage?.("compress", { candidates: results });
  }

  return { results, debug: buildDebug(args.query, rewrittenQueries, stages, totalStart) };
}
