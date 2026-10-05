import type { ProviderId, RetrievalDebug, RetrievalResult, Run } from "@ail/shared";
import { MODEL_CATALOG } from "@ail/shared";
import { getDefaultProviderId } from "../../providers/registry.js";
import { retrieve } from "./retrieval.js";
import { generateNonStreamingAnswer } from "./answer.js";

export type FailureMode = "miss" | "ignored" | "lost-in-middle" | "stale";

export interface FailureModeArgs {
  mode: FailureMode;
  query: string;
  collection: string;
}

export interface FailureModeResult {
  diagnosis: string;
  fix: string;
  retrievalDebug: RetrievalDebug;
  run: Run;
}

function defaultProviderModel(): { providerId: ProviderId; model: string } {
  const providerId = getDefaultProviderId();
  const model = MODEL_CATALOG.find((m) => m.providerId === providerId)?.id ?? "mock-small";
  return { providerId, model };
}

const RELEVANCE_BAR = 0.35;

async function demoMiss(query: string, collection: string, providerId: ProviderId, model: string): Promise<FailureModeResult> {
  const { results, debug } = await retrieve({ query, collection, topK: 5, providerId, model, strategy: "basic" });
  const relevant = results.filter((r) => r.score >= RELEVANCE_BAR);
  const run = await generateNonStreamingAnswer({ query, results: relevant, providerId, model, feature: "failure-demo-miss" });
  const topScore = results[0]?.score ?? 0;
  const diagnosis =
    relevant.length === 0
      ? `All ${results.length} retrieved candidates scored below the ${RELEVANCE_BAR} relevance bar (top score was ${topScore.toFixed(3)}), so the generator received NO grounding context and had to answer from its own prior knowledge instead - a textbook "retrieval miss".`
      : `Only ${relevant.length} of ${results.length} retrieved candidates cleared the ${RELEVANCE_BAR} relevance bar; the answer is grounded on a thin, possibly incomplete context.`;
  const fix =
    "Broaden retrieval (raise topK, add BM25/hybrid search for exact-term queries, or lower an overly strict relevance threshold), then re-run. If the needed chunk is still missing from a broad search, the fix is upstream in chunking/ingestion, not in retrieval parameters.";
  return { diagnosis, fix, retrievalDebug: debug, run };
}

async function demoIgnored(query: string, collection: string, providerId: ProviderId, model: string): Promise<FailureModeResult> {
  const { results, debug } = await retrieve({ query, collection, topK: 5, providerId, model, strategy: "basic" });
  const run = await generateNonStreamingAnswer({
    query,
    results,
    providerId,
    model,
    feature: "failure-demo-ignored",
    system: "Answer from general knowledge only. Do not mention or rely on the numbered context block even if one is present.",
  });
  const avgScore = results.length > 0 ? results.reduce((sum, r) => sum + r.score, 0) / results.length : 0;
  const diagnosis = `Retrieval found ${results.length} chunk(s) with an average score of ${avgScore.toFixed(3)} - the retrieval stage itself worked. But this run's system prompt instructed the model to disregard the provided context, which is exactly what "ignored context" looks like from the outside: a healthy retrievalDebug paired with an answer that doesn't reflect it. Diagnose this by comparing run.output.text's claims against the actual cited chunk text, not just by looking at retrieval scores.`;
  const fix = "Remove or soften prompt instructions that compete with grounding, and add an automated faithfulness check that flags answers whose claims don't map back to any retrieved/cited chunk - a good retrievalDebug does not guarantee the generation stage used it.";
  return { diagnosis, fix, retrievalDebug: debug, run };
}

async function demoLostInMiddle(query: string, collection: string, providerId: ProviderId, model: string): Promise<FailureModeResult> {
  const { results, debug } = await retrieve({ query, collection, topK: 15, providerId, model, strategy: "basic" });
  if (results.length < 2) {
    const run = await generateNonStreamingAnswer({ query, results, providerId, model, feature: "failure-demo-lost-in-middle" });
    return {
      diagnosis: `Only ${results.length} chunk(s) were retrieved for "${query}" in collection "${collection}" - too few to demonstrate lost-in-the-middle, which needs several chunks so the best one can be buried among others. Index more content, then retry with a broader query.`,
      fix: "Index more documents into this collection, or try a less narrow query, then re-run this demo.",
      retrievalDebug: debug,
      run,
    };
  }
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const best = sorted[0]!;
  const rest = sorted.slice(1);
  const middle = Math.floor(rest.length / 2);
  const reordered: RetrievalResult[] = [...rest.slice(0, middle), best, ...rest.slice(middle)].map((r, i) => ({
    ...r,
    rank: i,
  }));
  const run = await generateNonStreamingAnswer({ query, results: reordered, providerId, model, feature: "failure-demo-lost-in-middle" });
  const position = reordered.findIndex((r) => r.chunkId === best.chunkId) + 1;
  const diagnosis = `The single highest-scoring chunk (score ${best.score.toFixed(3)}) was deliberately placed at position ${position} of ${reordered.length} in the context - NOT first - to reproduce "lost-in-the-middle": models attend less reliably to information buried mid-context than to what's at the very start or end, even when it's the most relevant chunk retrieved.`;
  const fix = "Order context by relevance with the best chunks at the start (and/or end) of the prompt, reduce topK so there's less to get lost in, or add a reranking pass before generation so the final order reflects true relevance.";
  return { diagnosis, fix, retrievalDebug: debug, run };
}

async function demoStale(query: string, collection: string, providerId: ProviderId, model: string): Promise<FailureModeResult> {
  const { results, debug } = await retrieve({ query, collection, topK: 3, providerId, model, strategy: "basic" });
  const run = await generateNonStreamingAnswer({ query, results, providerId, model, feature: "failure-demo-stale" });
  const staleChunk = results[0];
  const diagnosis = staleChunk
    ? `The top retrieved chunk (score ${staleChunk.score.toFixed(3)}, chunk ${staleChunk.chunkId}) reflects whatever content was stored in the vector index at the time it was last upserted. If that source document has since been edited or corrected, this index keeps serving the OLD text indefinitely - updating a document's row in SQLite does NOT automatically re-chunk, re-embed, or re-upsert it into the vector store. This is the "stale index" failure mode: retrieval and generation both "work", but on outdated ground truth.`
    : `No chunks were retrieved for "${query}" in collection "${collection}", so a staleness comparison isn't meaningful here - index at least one document first.`;
  const fix = "Treat every document content update as a full re-chunk + re-embed + re-index operation, never a bare database row edit, and track an index freshness timestamp per document (e.g. `metadata.indexedAt` vs. the document's own `updatedAt`) so drift is visible instead of silent.";
  return { diagnosis, fix, retrievalDebug: debug, run };
}

/** Deliberately engineers one of the four named RAG failure modes against the caller's own collection/query, for teaching. */
export async function runFailureModeDemo(args: FailureModeArgs): Promise<FailureModeResult> {
  const { providerId, model } = defaultProviderModel();
  switch (args.mode) {
    case "miss":
      return demoMiss(args.query, args.collection, providerId, model);
    case "ignored":
      return demoIgnored(args.query, args.collection, providerId, model);
    case "lost-in-middle":
      return demoLostInMiddle(args.query, args.collection, providerId, model);
    case "stale":
      return demoStale(args.query, args.collection, providerId, model);
  }
}
