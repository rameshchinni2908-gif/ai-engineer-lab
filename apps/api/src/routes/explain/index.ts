import type { FastifyPluginAsync } from "fastify";
import { ExplainRunRequestSchema } from "@ail/shared";
import { parseBody } from "../../plugins/validation.js";
import { explainRun } from "../../services/explain/index.js";

/** `POST /api/explain-run` from contracts §3 - synchronous, requires a finished run (409 otherwise). */
const explainRoutes: FastifyPluginAsync = async (app) => {
  app.post("/explain-run", async (req) => {
    const body = parseBody(ExplainRunRequestSchema, req);
    return explainRun({
      runId: body.runId,
      difficulty: body.difficulty,
      comparisonRunId: body.comparisonRunId,
    });
  });
};

export default explainRoutes;
