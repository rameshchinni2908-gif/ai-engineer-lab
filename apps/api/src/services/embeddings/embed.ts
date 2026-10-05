import type { CostBreakdown, Message, ModuleId, ProviderId, Run, TokenUsage } from "@ail/shared";
import { getProvider } from "../../providers/registry.js";
import { insertRun, withSpan } from "../runs/index.js";
import { countApproxTokens } from "../runs/tokenizer.js";
import { unprocessableError } from "../../middleware/errors.js";

function zeroUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}
function zeroCost(): CostBreakdown {
  return { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, currency: "USD" };
}

export interface EmbedTextsArgs {
  texts: string[];
  providerId: ProviderId;
  /** `ModuleId` the embedding call is attributed to - `"embeddings"` for the explorer/similarity/vector-playground routes, `"rag"` for ingestion/retrieval embedding calls. */
  moduleId: ModuleId;
  model: string;
  feature: string;
  parentRunId?: string;
  traceId?: string;
}

export interface EmbedTextsResult {
  embeddings: number[][];
  dim: number;
  run: Run;
}

/**
 * Every call to `LLMProvider.embed()` goes through here so it records a
 * `Run`, per contracts.md §2.3 ("any route that calls an LLMProvider
 * creates one Run") - `embed()` is on the `LLMProvider` interface just like
 * `generate()`/`stream()`. Routes/services must call THIS, never
 * `getProvider(...).embed()` directly (routes -> services -> providers
 * layering per CLAUDE.md).
 */
export async function embedTexts(args: EmbedTextsArgs): Promise<EmbedTextsResult> {
  return withSpan(
    "embeddings.embed",
    "embedding",
    { providerId: args.providerId, model: args.model, textCount: args.texts.length },
    async ({ traceId }) => {
      const provider = getProvider(args.providerId);
      if (!provider.embed) {
        throw unprocessableError(`Provider "${args.providerId}" does not support embeddings`);
      }

      const effectiveTraceId = args.traceId ?? traceId;
      const inputMessages: Message[] = args.texts.map((t) => ({ role: "user" as const, content: t }));
      const start = Date.now();

      try {
        const embeddings = await provider.embed(args.texts, args.model);
        const latencyMs = Date.now() - start;
        const dim = embeddings[0]?.length ?? 0;
        const inputTokens = args.texts.reduce((sum, t) => sum + countApproxTokens(t), 0);
        const usage: TokenUsage = { inputTokens, outputTokens: 0, totalTokens: inputTokens };
        const cost = provider.estimateCost(usage, args.model);

        const run = await insertRun({
          moduleId: args.moduleId,
          feature: args.feature,
          providerId: args.providerId,
          model: args.model,
          params: {},
          input: { messages: inputMessages },
          output: { text: `Embedded ${args.texts.length} text(s) into ${dim}-dimensional vectors.` },
          usage,
          cost,
          latencyMs,
          status: "complete",
          completedAt: new Date().toISOString(),
          parentRunId: args.parentRunId,
          traceId: effectiveTraceId,
          tags: ["embedding"],
          metadata: { embedDim: dim, textCount: args.texts.length },
        });

        return { embeddings, dim, run };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await insertRun({
          moduleId: args.moduleId,
          feature: args.feature,
          providerId: args.providerId,
          model: args.model,
          params: {},
          input: { messages: inputMessages },
          output: { text: "" },
          usage: zeroUsage(),
          cost: zeroCost(),
          latencyMs: Date.now() - start,
          status: "error",
          error: message,
          parentRunId: args.parentRunId,
          traceId: effectiveTraceId,
          tags: ["embedding"],
          metadata: {},
        });
        throw err;
      }
    },
    { traceId: args.traceId },
  );
}
