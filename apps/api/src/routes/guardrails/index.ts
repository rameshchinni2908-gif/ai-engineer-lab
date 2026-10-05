import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GuardrailConfigSchema, ProviderIdSchema, type SseEvent } from "@ail/shared";
import { parseBody, parseQuery } from "../../plugins/validation.js";
import { openSseStream } from "../../plugins/sse.js";
import { getGuardrailConfig, setGuardrailConfig } from "../../services/guardrails/config.js";
import { ATTACK_CATALOG } from "../../services/guardrails/attacks.js";
import { buildOwaspMap } from "../../services/guardrails/owasp.js";
import { runAttackPipeline, persistAttackAudit } from "../../services/guardrails/pipeline.js";
import { listAuditLog } from "../../services/guardrails/audit.js";
import { insertRun } from "../../services/runs/index.js";
import { notFoundError } from "../../middleware/errors.js";
import { getAttackMeta } from "../../services/guardrails/attacks.js";

const AttackBodySchema = z.object({
  attackId: z.string(),
  configOverride: GuardrailConfigSchema.partial().optional(),
  providerId: ProviderIdSchema.optional(),
  model: z.string().optional(),
});

const AuditLogQuerySchema = z.object({
  resourceType: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().nonnegative().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

/** `/guardrails/*` routes from contracts §4 M8. */
const guardrailsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/config", async () => getGuardrailConfig());

  app.put("/config", async (req) => {
    const body = parseBody(GuardrailConfigSchema, req);
    return setGuardrailConfig(body, String(req.id));
  });

  app.get("/attacks", async () => ({ attacks: ATTACK_CATALOG }));

  app.get("/owasp-map", async () => ({ mappings: buildOwaspMap() }));

  app.get("/audit-log", async (req) => {
    const q = parseQuery(AuditLogQuerySchema, req);
    return listAuditLog(q);
  });

  app.post("/attack", async (req, reply) => {
    const body = parseBody(AttackBodySchema, req);
    if (!getAttackMeta(body.attackId)) throw notFoundError(`Attack ${body.attackId} not found`);

    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    const runId = `run_${requestId}`;
    try {
      const baseConfig = await getGuardrailConfig();
      const config = { ...baseConfig, ...(body.configOverride ?? {}) };

      writer.send({ type: "run_start", runId } as SseEvent);
      const result = runAttackPipeline(body.attackId, config, requestId);

      for (const stage of result.stages) {
        writer.send({
          type: "stage",
          runId,
          stage: `guardrail.${stage.layer}`,
          data: { layer: stage.layer, findings: stage.findings },
        } as SseEvent);
      }

      await persistAttackAudit(result, requestId);

      const run = await insertRun({
        id: runId,
        moduleId: "security",
        feature: "guardrail-attack",
        providerId: body.providerId ?? "mock",
        model: body.model ?? "demo-bot",
        params: {},
        input: { messages: [{ role: "user", content: result.userMessage }] },
        output: { text: result.botOutput },
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, currency: "USD" },
        latencyMs: 0,
        status: "complete",
        completedAt: new Date().toISOString(),
        tags: ["guardrail-attack"],
        metadata: { guardrailReport: result.report, attackId: body.attackId, attackSucceeded: result.attackSucceeded },
      });

      writer.send({ type: "run_complete", runId, run } as SseEvent);
    } catch (err) {
      writer.send({
        type: "error",
        runId,
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      } as SseEvent);
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });
};

export default guardrailsRoutes;
