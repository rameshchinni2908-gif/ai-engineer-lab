import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  GenerationParamsSchema,
  MessageSchema,
  ProviderIdSchema,
  findModel,
} from "@ail/shared";
import { parseBody } from "../../plugins/validation.js";
import { openSseStream } from "../../plugins/sse.js";
import { runGenerationOnce } from "../../services/runs/index.js";
import { validationError } from "../../middleware/errors.js";
import { tokenizeForVisualizer } from "../../services/fundamentals/tokenize.js";
import { computeContextWindow, type ContextStrategy } from "../../services/fundamentals/context-window.js";
import { runSamplingLab, runModelComparison } from "../../services/fundamentals/sample.js";

const TokenizeBodySchema = z.object({
  text: z.string(),
  model: z.string(),
});

const ContextWindowBodySchema = z.object({
  messages: z.array(MessageSchema),
  model: z.string(),
  strategy: z.enum(["truncate-oldest", "truncate-middle", "sliding-window", "summarize"]),
});

const SampleBodySchema = z.object({
  providerId: ProviderIdSchema,
  model: z.string(),
  messages: z.array(MessageSchema),
  params: GenerationParamsSchema.optional(),
  n: z.number().int().positive().max(10).optional(),
});

const CompareModelsBodySchema = z.object({
  models: z
    .array(z.object({ providerId: ProviderIdSchema, model: z.string() }))
    .min(1)
    .max(3),
  messages: z.array(MessageSchema),
  params: GenerationParamsSchema.optional(),
});

/** M1 LLM Fundamentals routes (contracts.md §4, prefix `/fundamentals`). */
const fundamentalsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/tokenize", async (req) => {
    const { text } = parseBody(TokenizeBodySchema, req);
    return tokenizeForVisualizer(text);
  });

  app.post("/context-window", async (req) => {
    const body = parseBody(ContextWindowBodySchema, req);
    const modelInfo = findModel(body.model);
    if (!modelInfo) {
      throw validationError(`Unknown model "${body.model}" - not found in MODEL_CATALOG`, {
        path: "model",
      });
    }
    // Reserve a sane default output allowance (small of maxOutputTokens / 1024)
    // so the "budget" represents headroom actually available for input.
    const outputReserve = Math.min(modelInfo.maxOutputTokens, 1024);
    const strategy = body.strategy as ContextStrategy;
    const result = await computeContextWindow({
      messages: body.messages,
      contextWindow: modelInfo.contextWindow,
      outputReserve,
      strategy,
      summarize:
        strategy === "summarize"
          ? async (dropped) => {
              const run = await runGenerationOnce({
                moduleId: "fundamentals",
                feature: "context-window-summarize",
                providerId: "mock",
                model: "mock-small",
                messages: [
                  {
                    role: "user",
                    content: `Summarize the following earlier conversation turns in one short sentence:\n${dropped
                      .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
                      .join("\n")}`,
                  },
                ],
              });
              return run.output.text;
            }
          : undefined,
    });
    return result;
  });

  app.post("/sample", async (req, reply) => {
    const body = parseBody(SampleBodySchema, req);
    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    try {
      await runSamplingLab({
        providerId: body.providerId,
        model: body.model,
        messages: body.messages,
        params: body.params,
        n: body.n,
        writer,
      });
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });

  app.post("/compare-models", async (req, reply) => {
    const body = parseBody(CompareModelsBodySchema, req);
    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    try {
      await runModelComparison({
        models: body.models,
        messages: body.messages,
        params: body.params,
        writer,
      });
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });
};

export default fundamentalsRoutes;
