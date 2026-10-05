/**
 * M1 sampling lab (`POST /fundamentals/sample`) + model comparison
 * (`POST /fundamentals/compare-models`) - contracts.md §4 M1.
 *
 * Both endpoints multiplex several logical runs over one SSE connection
 * using backend-core's `streamGeneration`, which already records a `Run`
 * per `runId` and emits `run_start`/`token`/`logprobs`/`run_complete` per
 * contracts §2. This module only supplies the orchestration: how many
 * parallel streams to open and with which per-stream params.
 */
import type { GenerationParams, Message, ProviderId } from "@ail/shared";
import { streamGeneration } from "../runs/generation.js";
import type { SseWriter } from "../../plugins/sse.js";

/**
 * Pure: builds the per-sample `GenerationParams` list for `n` parallel
 * samples. Without this, `n` samples sharing identical params would be
 * byte-identical in Mock mode (MockProvider derives its RNG seed from
 * `params.seed ?? hash(prompt)`, and the prompt/params are the same for
 * every sample) - which would defeat the whole point of a sampling lab.
 * Each sample gets a distinct, deterministic seed offset by its index so
 * re-running the exact same request reproduces the exact same `n` outputs.
 */
export function buildSampleParamsList(params: GenerationParams, n: number): GenerationParams[] {
  const count = Math.max(1, Math.floor(n));
  return Array.from({ length: count }, (_, i) => ({
    ...params,
    seed: (params.seed ?? 0) + i,
  }));
}

export interface RunSamplingLabArgs {
  providerId: ProviderId;
  model: string;
  messages: Message[];
  params?: GenerationParams;
  n?: number;
  writer: SseWriter;
}

/** Fires `n` parallel samples over one SSE connection, each its own persisted `Run`. */
export async function runSamplingLab(args: RunSamplingLabArgs): Promise<void> {
  const paramsList = buildSampleParamsList(args.params ?? {}, args.n ?? 1);
  await Promise.all(
    paramsList.map((params, index) =>
      streamGeneration({
        moduleId: "fundamentals",
        feature: "sampling-lab",
        providerId: args.providerId,
        model: args.model,
        messages: args.messages,
        params,
        writer: args.writer,
        tags: ["sampling-lab"],
        metadata: { sampleIndex: index },
      }),
    ),
  );
}

export interface ModelEntry {
  providerId: ProviderId;
  model: string;
}

export interface RunModelComparisonArgs {
  models: ModelEntry[];
  messages: Message[];
  params?: GenerationParams;
  writer: SseWriter;
}

/** Runs the same prompt across 2-3 models concurrently on one SSE connection, one `runId` per model. */
export async function runModelComparison(args: RunModelComparisonArgs): Promise<void> {
  await Promise.all(
    args.models.map((entry) =>
      streamGeneration({
        moduleId: "fundamentals",
        feature: "model-comparison",
        providerId: entry.providerId,
        model: entry.model,
        messages: args.messages,
        params: args.params,
        writer: args.writer,
        tags: ["model-comparison"],
        metadata: { comparedModel: entry.model, comparedProvider: entry.providerId },
      }),
    ),
  );
}
