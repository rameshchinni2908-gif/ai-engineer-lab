import type { ProviderId, RetrievalDebug, RetrievalResult, RetrievalSource } from "@ail/shared";
import { getProvider } from "../../providers/registry.js";
import { withSpan } from "../runs/index.js";
import { getVectorStore } from "../../stores/vector/registry.js";
import { isScannable } from "../../stores/vector/types.js";
import { internalError, unprocessableError } from "../../middleware/errors.js";
import { bm25Search } from "./bm25.js";
import { reciprocalRankFusion } from "./rrf.js";

export interface HybridSearchArgs {
  collection: string;
  query: string;
  topK: number;
  providerId: ProviderId;
  model: string;
  rrfK?: number;
  traceId?: string;
}

export interface HybridSearchResult {
  results: RetrievalResult[];
  debug: RetrievalDebug;
}

/**
 * BM25 (lexical) + dense vector search, fused via Reciprocal Rank Fusion.
 * Wrapped in a `withSpan("retrieval")` so this stage shows up under
 * `GET /traces/:id` alongside the rest of a RAG pipeline run (M5 reuses this
 * directly for its "basic" retrieval strategy option).
 */
export async function hybridSearch(args: HybridSearchArgs): Promise<HybridSearchResult> {
  return withSpan(
    "vector.hybrid_search",
    "retrieval",
    { collection: args.collection, query: args.query, topK: args.topK },
    async () => {
      const store = await getVectorStore();
      if (!isScannable(store)) {
        throw internalError("The active vector store does not support enumeration needed for hybrid search");
      }
      const totalStart = Date.now();

      const bm25Start = Date.now();
      const allPoints = await store.listAll(args.collection);
      const corpus = allPoints.map((p) => ({ id: p.id, text: String(p.metadata.text ?? "") }));
      const bm25Results = bm25Search(args.query, corpus);
      const bm25TimingMs = Date.now() - bm25Start;

      const vectorStart = Date.now();
      const provider = getProvider(args.providerId);
      if (!provider.embed) {
        throw unprocessableError(`Provider "${args.providerId}" does not support embeddings`);
      }
      const [queryVector] = await provider.embed([args.query], args.model);
      const vectorHits = await store.search(args.collection, queryVector!, { topK: Math.max(args.topK * 2, args.topK) });
      const vectorTimingMs = Date.now() - vectorStart;

      const fusionStart = Date.now();
      const bm25Ranking = bm25Results.filter((r) => r.score > 0).map((r) => r.id);
      const vectorRanking = vectorHits.map((h) => h.id);
      const fused = reciprocalRankFusion([bm25Ranking, vectorRanking], args.rrfK ?? 60);
      const fusionTimingMs = Date.now() - fusionStart;

      const byId = new Map(allPoints.map((p) => [p.id, p]));
      const toResult = (id: string, score: number, source: RetrievalSource, rank: number): RetrievalResult => {
        const point = byId.get(id);
        const metadata = point?.metadata ?? {};
        return {
          chunkId: String(metadata.chunkId ?? id),
          text: String(metadata.text ?? ""),
          score,
          rank,
          source,
          documentId: String(metadata.documentId ?? ""),
          metadata,
        };
      };

      const bm25Stage = bm25Results
        .filter((r) => r.score > 0)
        .slice(0, args.topK)
        .map((r, i) => toResult(r.id, r.score, "bm25", i));
      const vectorStage = vectorHits.slice(0, args.topK).map((h, i) => toResult(h.id, h.score, "vector", i));
      const fusedStage = fused.slice(0, args.topK).map((f, i) => toResult(f.id, f.score, "hybrid", i));

      const debug: RetrievalDebug = {
        query: args.query,
        rewrittenQueries: [],
        stages: [
          { stage: "bm25", candidates: bm25Stage, timingMs: bm25TimingMs },
          { stage: "vector", candidates: vectorStage, timingMs: vectorTimingMs },
          { stage: "fusion", candidates: fusedStage, timingMs: fusionTimingMs },
        ],
        fusionDetails: {
          rrfK: args.rrfK ?? 60,
          bm25CandidateCount: bm25Ranking.length,
          vectorCandidateCount: vectorRanking.length,
        },
        totalTimingMs: Date.now() - totalStart,
      };

      return { results: fusedStage, debug };
    },
    { traceId: args.traceId },
  );
}
