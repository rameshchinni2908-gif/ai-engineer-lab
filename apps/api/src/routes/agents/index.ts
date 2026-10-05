import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AgentRuntimeSchema, AgentLimitsSchema, GenerationParamsSchema, ProviderIdSchema } from "@ail/shared";
import { parseBody, parseParams } from "../../plugins/validation.js";
import { openSseStream } from "../../plugins/sse.js";
import { notFoundError, conflictError } from "../../middleware/errors.js";
import {
  runAgent,
  getAgentRun,
  listAgentToolDefinitions,
  getAgentMemory,
  resolveApproval,
  hasPendingApproval,
} from "../../services/agents/index.js";

/** Route-local request schema per docs/contracts.md §4-M6; not reused elsewhere, so it stays local per §0.2. */
const AgentRunRequestSchema = z.object({
  runtime: AgentRuntimeSchema,
  goal: z.string().min(1),
  toolAllowList: z.array(z.string()),
  providerId: ProviderIdSchema,
  model: z.string(),
  limits: AgentLimitsSchema,
  params: GenerationParamsSchema.optional(),
});

const IdParamsSchema = z.object({ id: z.string() });

const ApproveBodySchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  approved: z.boolean(),
  note: z.string().optional(),
});

const agentsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/run", async (req, reply) => {
    const body = parseBody(AgentRunRequestSchema, req);
    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    try {
      await runAgent(body, writer);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writer.send({ type: "error", code: "INTERNAL_ERROR", message });
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });

  app.get("/tools", async () => {
    return { tools: listAgentToolDefinitions() };
  });

  app.get("/:id", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const run = await getAgentRun(id);
    if (!run) throw notFoundError(`Agent run ${id} not found`);
    return run;
  });

  app.get("/:id/memory", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const run = await getAgentRun(id);
    if (!run) throw notFoundError(`Agent run ${id} not found`);
    const memory = getAgentMemory(id);
    return memory ? memory.snapshot() : { shortTerm: [], longTerm: [], summary: "", retrievals: [] };
  });

  app.post("/:id/approve", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const { stepIndex, approved, note } = parseBody(ApproveBodySchema, req);
    if (!hasPendingApproval(id, stepIndex)) {
      throw conflictError(`Agent run ${id} is not currently paused awaiting approval at step ${stepIndex}`);
    }
    resolveApproval(id, stepIndex, approved, note);
    return { ok: true };
  });
};

export default agentsRoutes;
