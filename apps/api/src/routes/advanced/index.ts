import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GenerationParamsSchema, MessageSchema, ProviderIdSchema } from "@ail/shared";
import { parseBody } from "../../plugins/validation.js";
import { openSseStream } from "../../plugins/sse.js";
import { streamGeneration, getRun } from "../../services/runs/index.js";
import {
  computeAttentionHeatmap,
  computeQuantizationDemo,
  runSyntheticDataGeneration,
  assertVisionCapable,
  listReasoningPresets,
} from "../../services/advanced/index.js";

const AttentionHeatmapBodySchema = z.object({
  text: z.string().min(1),
  providerId: ProviderIdSchema,
  model: z.string(),
});

const QuantizationBodySchema = z.object({
  model: z.string(),
  precision: z.enum(["fp16", "int8", "int4"]),
});

const SyntheticDataBodySchema = z.object({
  seedExamples: z.array(z.record(z.string(), z.unknown())).min(1),
  count: z.number().int().positive().max(50),
  providerId: ProviderIdSchema,
  model: z.string(),
});

const MultimodalBodySchema = z.object({
  messages: z.array(MessageSchema).min(1),
  providerId: ProviderIdSchema,
  model: z.string(),
  params: GenerationParamsSchema.optional(),
});

/**
 * `/api/advanced/*` from contracts §4 M10. Mounted at prefix `/api/advanced`
 * by the route registry - paths here are relative to that prefix.
 */
const advancedRoutes: FastifyPluginAsync = async (app) => {
  app.post("/attention-heatmap", async (req) => {
    const { text } = parseBody(AttentionHeatmapBodySchema, req);
    return computeAttentionHeatmap({ text });
  });

  app.post("/quantization-demo", async (req) => {
    const body = parseBody(QuantizationBodySchema, req);
    return computeQuantizationDemo(body);
  });

  app.post("/synthetic-data", async (req, reply) => {
    const body = parseBody(SyntheticDataBodySchema, req);
    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    try {
      const result = await runSyntheticDataGeneration({ ...body, writer });
      // run_complete.run.output.parsedJson holds the full generated array,
      // per contracts §4 M10 - fetch the just-persisted wrapper run so the
      // emitted event carries the real Run shape, same as streamGeneration does.
      const run = await getRun(result.runId);
      if (run) writer.send({ type: "run_complete", runId: run.id, run });
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });

  app.post("/multimodal-demo", async (req, reply) => {
    const body = parseBody(MultimodalBodySchema, req);
    assertVisionCapable(body.model); // throws 422 before hijacking the response if unsupported

    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    try {
      await streamGeneration({
        moduleId: "advanced",
        feature: "multimodal-demo",
        providerId: body.providerId,
        model: body.model,
        messages: body.messages,
        params: body.params,
        writer,
      });
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });

  app.get("/reasoning-presets", async () => {
    return { presets: listReasoningPresets() };
  });
};

export default advancedRoutes;
