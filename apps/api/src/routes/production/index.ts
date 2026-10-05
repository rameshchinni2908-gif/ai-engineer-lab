import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GenerationParamsSchema, MessageSchema, ProviderIdSchema } from "@ail/shared";
import { parseBody, parseQuery } from "../../plugins/validation.js";
import { openSseStream } from "../../plugins/sse.js";
import { streamGeneration, withSpan } from "../../services/runs/index.js";
import {
  getCostSummary,
  runCacheSim,
  runRoutingSim,
  runBatchingSim,
  runContextTrimSim,
  runReliabilitySim,
  listLatencyLabPresets,
} from "../../services/production/index.js";

const CostSummaryQuerySchema = z.object({
  groupBy: z.enum(["module", "feature", "model", "providerId"]),
  from: z.string().optional(),
  to: z.string().optional(),
});

const CacheSimBodySchema = z.object({
  cacheType: z.enum(["prompt", "semantic", "response"]),
  requests: z.array(z.object({ prompt: z.string() })).min(1),
  assumedHitRate: z.number().min(0).max(1).optional(),
  providerId: ProviderIdSchema.optional(),
  model: z.string().optional(),
});

const RoutingSimBodySchema = z.object({
  requests: z.array(z.object({ prompt: z.string(), complexity: z.enum(["low", "high"]).optional() })).min(1),
  strategy: z.enum(["cheapest", "complexity-based", "fallback-chain"]),
  candidateModels: z.array(z.string()).min(1),
});

const BatchingSimBodySchema = z.object({
  requests: z.array(z.object({ prompt: z.string() })).min(1),
  batchSize: z.number().int().min(1),
  providerId: ProviderIdSchema,
  model: z.string(),
});

const ContextTrimSimBodySchema = z.object({
  messages: z.array(MessageSchema).min(1),
  providerId: ProviderIdSchema,
  model: z.string(),
  strategy: z.enum(["truncate-oldest", "truncate-middle", "sliding-window", "summarize"]),
});

const ReliabilitySimBodySchema = z.object({
  scenario: z.enum(["timeout", "provider-down", "rate-limited", "duplicate-request", "queue-backpressure"]),
  policy: z.object({
    maxRetries: z.number().int().nonnegative(),
    backoffMs: z.number().nonnegative(),
    fallbackProviderId: ProviderIdSchema.optional(),
    circuitBreakerThreshold: z.number().int().positive().optional(),
    idempotencyKey: z.string().optional(),
    queueConcurrency: z.number().int().positive().optional(),
  }),
});

const LatencyLabRunBodySchema = z.object({
  providerId: ProviderIdSchema,
  model: z.string(),
  messages: z.array(MessageSchema).min(1),
  params: GenerationParamsSchema.optional(),
});

/**
 * `/api/production/*` from contracts §4 M9. Mounted at prefix `/api/production`
 * by backend-core's route registry (`routes/index.ts`), so paths here are
 * declared RELATIVE to that prefix - do not repeat "/production" below.
 */
const productionRoutes: FastifyPluginAsync = async (app) => {
  app.get("/cost-summary", async (req) => {
    const q = parseQuery(CostSummaryQuerySchema, req);
    return getCostSummary(q);
  });

  app.post("/cache-sim", async (req) => {
    const body = parseBody(CacheSimBodySchema, req);
    return runCacheSim(body);
  });

  app.post("/routing-sim", async (req) => {
    const body = parseBody(RoutingSimBodySchema, req);
    return runRoutingSim(body);
  });

  app.post("/batching-sim", async (req) => {
    const body = parseBody(BatchingSimBodySchema, req);
    return runBatchingSim(body);
  });

  app.post("/context-trim-sim", async (req) => {
    const body = parseBody(ContextTrimSimBodySchema, req);
    return runContextTrimSim(body);
  });

  app.post("/reliability-sim", async (req) => {
    const { scenario, policy } = parseBody(ReliabilitySimBodySchema, req);
    return runReliabilitySim(scenario, policy);
  });

  app.get("/latency-lab/presets", async () => {
    return { presets: listLatencyLabPresets() };
  });

  app.post("/latency-lab/run", async (req, reply) => {
    const body = parseBody(LatencyLabRunBodySchema, req);
    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    try {
      // Wrapped in withSpan so this run gets a traceId and shows up under
      // GET /traces - the Tracing Dashboard's span waterfall needs REAL
      // spans to render (contracts.md §4 M9: aggregates real Trace/Span
      // data, never synthesized).
      await withSpan(
        "latency-lab.generate",
        "llm_call",
        { moduleId: "production", feature: "latency-lab", model: body.model },
        async ({ traceId }) =>
          streamGeneration({
            moduleId: "production",
            feature: "latency-lab",
            providerId: body.providerId,
            model: body.model,
            messages: body.messages,
            params: body.params,
            traceId,
            writer,
          }),
      );
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });
};

export default productionRoutes;
