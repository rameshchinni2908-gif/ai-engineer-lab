import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GenerationParamsSchema, MessageSchema, ProviderIdSchema, ToolDefinitionSchema } from "@ail/shared";
import { parseBody } from "../../plugins/validation.js";
import { openSseStream } from "../../plugins/sse.js";
import { runStructuredGenerate } from "../../services/structured/generate.js";
import { validateJson } from "../../services/structured/schema-validator.js";
import { runRepairLoop } from "../../services/structured/repair.js";
import { runToolCallPlayground } from "../../services/structured/tool-call.js";
import { MOCK_TOOL_DEFINITIONS } from "../../services/structured/mock-tools.js";

const GenerateBodySchema = z.object({
  mode: z.enum(["json_mode", "schema_constrained", "forced_tool"]),
  providerId: ProviderIdSchema,
  model: z.string(),
  messages: z.array(MessageSchema),
  responseSchema: z.unknown().optional(),
  params: GenerationParamsSchema.optional(),
});

const ValidateBodySchema = z.object({
  json: z.unknown(),
  schema: z.unknown(),
});

const RepairBodySchema = z.object({
  invalidJson: z.string(),
  schema: z.unknown(),
  providerId: ProviderIdSchema,
  model: z.string(),
  maxAttempts: z.number().int().positive().max(5).optional(),
});

const ToolCallBodySchema = z.object({
  providerId: ProviderIdSchema,
  model: z.string(),
  messages: z.array(MessageSchema),
  tools: z.array(ToolDefinitionSchema).optional(),
  params: GenerationParamsSchema.optional(),
});

/** M3 Structured Output & Tools routes (contracts.md §4, prefix `/structured`). */
const structuredRoutes: FastifyPluginAsync = async (app) => {
  app.post("/generate", async (req, reply) => {
    const body = parseBody(GenerateBodySchema, req);
    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    try {
      await runStructuredGenerate({
        mode: body.mode,
        providerId: body.providerId,
        model: body.model,
        messages: body.messages,
        responseSchema: body.responseSchema,
        params: body.params,
        writer,
      });
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });

  app.post("/validate", async (req) => {
    const { json, schema } = parseBody(ValidateBodySchema, req);
    return validateJson(json, schema);
  });

  app.post("/repair", async (req, reply) => {
    const body = parseBody(RepairBodySchema, req);
    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    try {
      await runRepairLoop({
        invalidJson: body.invalidJson,
        schema: body.schema,
        providerId: body.providerId,
        model: body.model,
        maxAttempts: body.maxAttempts,
        writer,
      });
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });

  app.post("/tool-call", async (req, reply) => {
    const body = parseBody(ToolCallBodySchema, req);
    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    try {
      await runToolCallPlayground({
        providerId: body.providerId,
        model: body.model,
        messages: body.messages,
        tools: body.tools && body.tools.length > 0 ? body.tools : MOCK_TOOL_DEFINITIONS,
        params: body.params,
        writer,
      });
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });
};

export default structuredRoutes;
