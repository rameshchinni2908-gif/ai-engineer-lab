import type { ProviderId, RetrievalResult, RetrievalSource, VectorSearchHit } from "@ail/shared";
import { getProvider } from "../../providers/registry.js";
import { getVectorStore } from "../../stores/vector/registry.js";
import { unprocessableError } from "../../middleware/errors.js";
import { runGenerationOnce } from "../runs/index.js";

/** Embeds `queryText` and runs a plain vector search against `collection` - the shared building block every RAG strategy retrieves through. */
export async function vectorRetrieve(
  queryText: string,
  collection: string,
  topK: number,
  providerId: ProviderId,
  model: string,
): Promise<{ hits: VectorSearchHit[] }> {
  const provider = getProvider(providerId);
  if (!provider.embed) {
    throw unprocessableError(`Provider "${providerId}" does not support embeddings`);
  }
  const [vector] = await provider.embed([queryText], model);
  const store = await getVectorStore();
  const hits = await store.search(collection, vector!, { topK });
  return { hits };
}

/** Maps a raw `VectorSearchHit` (whose `metadata` was set at index time, see `services/rag/ingest.ts`) into a `RetrievalResult`. */
export function hitToResult(
  hit: VectorSearchHit,
  source: RetrievalSource,
  rank: number,
  scoreOverride?: number,
): RetrievalResult {
  const metadata = hit.metadata ?? {};
  return {
    chunkId: String(metadata.chunkId ?? hit.id),
    text: String(metadata.text ?? ""),
    score: scoreOverride ?? hit.score,
    rank,
    source,
    documentId: String(metadata.documentId ?? ""),
    metadata,
  };
}

interface RewriteDeps {
  providerId: ProviderId;
  model: string;
  parentRunId?: string;
  traceId?: string;
}

/** One real LLM call (its own persisted `Run`, chained via `parentRunId`) that rewrites a query into a clearer standalone search query. */
export async function rewriteQuery(query: string, deps: RewriteDeps): Promise<{ text: string; runId: string }> {
  const run = await runGenerationOnce({
    moduleId: "rag",
    feature: "query-rewrite",
    providerId: deps.providerId,
    model: deps.model,
    messages: [
      { role: "user", content: `Rewrite the following question as a clear, self-contained search query: ${query}` },
    ],
    parentRunId: deps.parentRunId,
    traceId: deps.traceId,
  });
  return { text: run.output.text || query, runId: run.id };
}

/** HyDE: generates a hypothetical answer so the RETRIEVAL embeds that answer's text, not the raw (often terser) query. */
export async function generateHypotheticalAnswer(query: string, deps: RewriteDeps): Promise<{ text: string; runId: string }> {
  const run = await runGenerationOnce({
    moduleId: "rag",
    feature: "hyde",
    providerId: deps.providerId,
    model: deps.model,
    messages: [
      { role: "user", content: `Write a brief hypothetical answer to this question, as if you already knew it: ${query}` },
    ],
    parentRunId: deps.parentRunId,
    traceId: deps.traceId,
  });
  return { text: run.output.text || query, runId: run.id };
}

/** Multi-query: N independent LLM-generated rephrasings of the same question, each retrieved separately and fused by the caller. */
export async function generateQueryVariants(query: string, deps: RewriteDeps, n = 3): Promise<string[]> {
  const variants: string[] = [];
  for (let i = 0; i < n; i++) {
    const run = await runGenerationOnce({
      moduleId: "rag",
      feature: "multi-query",
      providerId: deps.providerId,
      model: deps.model,
      messages: [
        { role: "user", content: `Rephrase this question in an alternative way (variant ${i + 1} of ${n}): ${query}` },
      ],
      parentRunId: deps.parentRunId,
      traceId: deps.traceId,
    });
    variants.push(run.output.text || query);
  }
  return variants;
}
