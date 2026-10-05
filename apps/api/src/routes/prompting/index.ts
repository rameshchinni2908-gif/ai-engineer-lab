import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GenerationParamsSchema, ProviderIdSchema } from "@ail/shared";
import { parseBody, parseParams, parseQuery } from "../../plugins/validation.js";
import { openSseStream } from "../../plugins/sse.js";
import { notFoundError } from "../../middleware/errors.js";
import { renderNaive, renderHardened, checkTemplateSafety } from "../../services/prompting/render.js";
import { runTechniqueDemo, type Technique } from "../../services/prompting/technique-demo.js";
import { runCoach } from "../../services/prompting/coach.js";
import {
  createPromptVersion,
  listPromptVersions,
  getPromptVersion,
  updatePromptVersion,
  deletePromptVersion,
} from "../../services/prompting/prompt-versions.js";

const RenderBodySchema = z.object({
  template: z.string(),
  variables: z.record(z.string(), z.string()),
  system: z.string().optional(),
  /** Route-local extension: choose naive (unsafe) vs hardened (delimiter-escaped) interpolation. Defaults to hardened. */
  mode: z.enum(["naive", "hardened"]).optional(),
});

const TechniqueDemoBodySchema = z.object({
  technique: z.enum(["zero-shot", "few-shot", "cot", "self-consistency", "role", "xml-delimiters", "prefill", "chaining"]),
  input: z.string(),
  providerId: ProviderIdSchema,
  model: z.string(),
  params: GenerationParamsSchema.optional(),
});

const CoachBodySchema = z.object({
  prompt: z.string(),
  providerId: ProviderIdSchema.optional(),
  model: z.string().optional(),
});

const PromptVersionListQuerySchema = z.object({
  name: z.string().optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().nonnegative().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

const CreatePromptVersionBodySchema = z.object({
  name: z.string(),
  template: z.string(),
  variables: z.array(z.string()),
  system: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const UpdatePromptVersionBodySchema = z.object({
  name: z.string().optional(),
  template: z.string().optional(),
  variables: z.array(z.string()).optional(),
  system: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const IdParamsSchema = z.object({ id: z.string() });

const InjectionCheckBodySchema = z.object({ template: z.string() });

/** M2 Prompt Engineering routes (contracts.md §4, prefix `/prompting`). */
const promptingRoutes: FastifyPluginAsync = async (app) => {
  app.post("/render", async (req) => {
    const body = parseBody(RenderBodySchema, req);
    const result =
      body.mode === "naive" ? renderNaive(body.template, body.variables) : renderHardened(body.template, body.variables);
    return result;
  });

  app.post("/technique-demo", async (req, reply) => {
    const body = parseBody(TechniqueDemoBodySchema, req);
    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    try {
      await runTechniqueDemo({
        technique: body.technique as Technique,
        input: body.input,
        providerId: body.providerId,
        model: body.model,
        params: body.params,
        writer,
      });
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });

  app.post("/coach", async (req) => {
    const body = parseBody(CoachBodySchema, req);
    const result = await runCoach(body);
    return {
      score: result.score,
      issues: result.issues,
      improvedPrompt: result.improvedPrompt,
      diff: result.diff,
      metadata: { runId: result.runId },
    };
  });

  app.get("/prompt-versions", async (req) => {
    const q = parseQuery(PromptVersionListQuerySchema, req);
    return listPromptVersions(q);
  });

  app.post("/prompt-versions", async (req, reply) => {
    const body = parseBody(CreatePromptVersionBodySchema, req);
    const created = await createPromptVersion(body);
    reply.code(201);
    reply.header("Location", `/api/prompting/prompt-versions/${created.id}`);
    return created;
  });

  app.get("/prompt-versions/:id", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const pv = await getPromptVersion(id);
    if (!pv) throw notFoundError(`PromptVersion ${id} not found`);
    return pv;
  });

  app.put("/prompt-versions/:id", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const body = parseBody(UpdatePromptVersionBodySchema, req);
    return updatePromptVersion(id, body);
  });

  app.delete("/prompt-versions/:id", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const deleted = await deletePromptVersion(id);
    if (!deleted) throw notFoundError(`PromptVersion ${id} not found`);
    return { ok: true };
  });

  app.post("/injection-check", async (req) => {
    const { template } = parseBody(InjectionCheckBodySchema, req);
    return checkTemplateSafety(template);
  });
};

export default promptingRoutes;
