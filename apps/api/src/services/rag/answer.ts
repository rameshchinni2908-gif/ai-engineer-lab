import type { GenerationParams, ProviderId, RetrievalResult, Run } from "@ail/shared";
import type { SseWriter } from "../../plugins/sse.js";
import { runGenerationOnce, streamGeneration } from "../runs/index.js";

/** Builds the numbered, citable context block every RAG generation call (streaming or not) shares. */
export function buildContextPrompt(query: string, results: RetrievalResult[]): string {
  if (results.length === 0) {
    return `No relevant context was retrieved. Answer the question if you can from general knowledge, and clearly say no supporting context was found.\n\nQuestion: ${query}`;
  }
  const context = results.map((r, i) => `[${i + 1}] (chunk ${r.chunkId}) ${r.text}`).join("\n\n");
  return `Answer the question using ONLY the numbered context below, and cite sources by their [n] number.\n\nContext:\n${context}\n\nQuestion: ${query}`;
}

function citationsFor(results: RetrievalResult[]): { chunkId: string; documentId: string }[] {
  return results.map((r) => ({ chunkId: r.chunkId, documentId: r.documentId }));
}

export interface GenerateAnswerArgs {
  runId: string;
  query: string;
  results: RetrievalResult[];
  providerId: ProviderId;
  model: string;
  params?: GenerationParams;
  traceId?: string;
  writer: SseWriter;
}

/** Streaming generation for `POST /rag/query`: citations are pre-attached to `metadata` so they're present from `run_start` through `run_complete`. */
export async function generateAnswer(args: GenerateAnswerArgs): Promise<Run> {
  return streamGeneration({
    runId: args.runId,
    moduleId: "rag",
    feature: "query",
    providerId: args.providerId,
    model: args.model,
    messages: [{ role: "user", content: buildContextPrompt(args.query, args.results) }],
    params: args.params,
    traceId: args.traceId,
    metadata: { citations: citationsFor(args.results) },
    writer: args.writer,
  });
}

export interface GenerateNonStreamingArgs {
  query: string;
  results: RetrievalResult[];
  providerId: ProviderId;
  model: string;
  feature: string;
  system?: string;
  traceId?: string;
}

/** Non-streaming generation used by `/rag/failure-mode-demo` (a single demonstrative call, not an interactive generation). */
export async function generateNonStreamingAnswer(args: GenerateNonStreamingArgs): Promise<Run> {
  return runGenerationOnce({
    moduleId: "rag",
    feature: args.feature,
    providerId: args.providerId,
    model: args.model,
    messages: [{ role: "user", content: buildContextPrompt(args.query, args.results) }],
    system: args.system,
    traceId: args.traceId,
    metadata: { citations: citationsFor(args.results) },
  });
}
