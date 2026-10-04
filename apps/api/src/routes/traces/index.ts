import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parseParams, parseQuery } from "../../plugins/validation.js";
import { getTrace, listTraces } from "../../services/runs/index.js";
import { notFoundError } from "../../middleware/errors.js";

const ListQuerySchema = z.object({
  moduleId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().nonnegative().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

const IdParamsSchema = z.object({ id: z.string() });

/** `GET /api/traces`, `GET /api/traces/:id` from contracts §3. */
const tracesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/traces", async (req) => {
    const q = parseQuery(ListQuerySchema, req);
    return listTraces(q);
  });

  app.get("/traces/:id", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const trace = await getTrace(id);
    if (!trace) throw notFoundError(`Trace ${id} not found`);
    return trace;
  });
};

export default tracesRoutes;
