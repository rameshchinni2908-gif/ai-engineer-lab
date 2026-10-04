import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GenerationParamsSchema } from "@ail/shared";
import { parseBody, parseParams, parseQuery } from "../../plugins/validation.js";
import { openSseStream } from "../../plugins/sse.js";
import { listRuns, getRun, deleteRun, replayRun, compareRuns } from "../../services/runs/index.js";
import { notFoundError } from "../../middleware/errors.js";

const ListQuerySchema = z.object({
  moduleId: z.string().optional(),
  feature: z.string().optional(),
  providerId: z.string().optional(),
  model: z.string().optional(),
  traceId: z.string().optional(),
  tags: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().nonnegative().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

const IdParamsSchema = z.object({ id: z.string() });

const ReplayBodySchema = z.object({ overrideParams: GenerationParamsSchema.optional() });

const CompareQuerySchema = z.object({ a: z.string(), b: z.string() });

/** Platform run endpoints from contracts §3: list/get/delete/replay/compare. */
const runsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/runs", async (req) => {
    const q = parseQuery(ListQuerySchema, req);
    const result = await listRuns({
      ...q,
      tags: q.tags ? q.tags.split(",").filter(Boolean) : undefined,
    });
    return result;
  });

  app.get("/runs/compare", async (req) => {
    const { a, b } = parseQuery(CompareQuerySchema, req);
    return compareRuns(a, b);
  });

  app.get("/runs/:id", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const run = await getRun(id);
    if (!run) throw notFoundError(`Run ${id} not found`);
    return run;
  });

  app.delete("/runs/:id", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const deleted = await deleteRun(id);
    if (!deleted) throw notFoundError(`Run ${id} not found`);
    return { ok: true };
  });

  app.post("/runs/:id/replay", async (req, reply) => {
    const { id } = parseParams(IdParamsSchema, req);
    const { overrideParams } = parseBody(ReplayBodySchema, req);

    // Validate existence BEFORE hijacking the response, so a missing run
    // still gets a normal 404 JSON error rather than a broken SSE stream.
    if (!(await getRun(id))) throw notFoundError(`Run ${id} not found`);

    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    try {
      await replayRun({ runId: id, overrideParams, writer });
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });
};

export default runsRoutes;
