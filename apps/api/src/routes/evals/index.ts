import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { DatasetSchema, EvalCaseSchema, EvalVariantSchema, MetricIdSchema } from "@ail/shared";
import { parseBody, parseParams, parseQuery } from "../../plugins/validation.js";
import { openSseStream } from "../../plugins/sse.js";
import { notFoundError } from "../../middleware/errors.js";
import {
  insertDataset,
  requireDataset,
  listDatasets,
  updateDataset,
  deleteDataset,
  getEvalSuiteResult,
  requireEvalSuiteResult,
  listEvalSuiteResults,
} from "../../services/evals/store.js";
import { parseImportContent, exportDataset } from "../../services/evals/importExport.js";
import { runEvalSuite } from "../../services/evals/runner.js";
import { checkSuiteAgainstThresholds } from "../../services/evals/ciCheck.js";
import {
  calibrateJudge,
  demonstratePositionBias,
  demonstrateSelfEnhancementBias,
  demonstrateVerbosityBias,
} from "../../services/evals/judgeBias.js";

const ListQuerySchema = z.object({
  page: z.coerce.number().int().nonnegative().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});
const IdParamsSchema = z.object({ id: z.string() });

const CreateDatasetSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  cases: z.array(EvalCaseSchema),
});
const UpdateDatasetSchema = DatasetSchema.omit({ id: true }).partial();
const ImportBodySchema = z.object({ format: z.enum(["json", "csv"]), content: z.string() });
const ExportQuerySchema = z.object({ format: z.enum(["json", "csv"]).optional() });

const RunBodySchema = z.object({
  datasetId: z.string(),
  variants: z.array(EvalVariantSchema).min(1),
  metricIds: z.array(MetricIdSchema).min(1),
  judgeRubric: z.string().optional(),
});

const SuiteResultsQuerySchema = z.object({
  datasetId: z.string().optional(),
  page: z.coerce.number().int().nonnegative().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

const CiCheckBodySchema = z.object({
  suiteResultId: z.string(),
  thresholds: z.record(MetricIdSchema, z.number()),
});

// Route-local DTOs for the judge-bias education + calibration lab
// (contracts §4 M7 narrative requirement; no dedicated route was pre-listed
// in the contract table, so this is added under this module's own /evals
// prefix - flagged to the orchestrator as a contract-doc gap, not a
// violation of route ownership).
const JudgeBiasDemoBodySchema = z.discriminatedUnion("demo", [
  z.object({ demo: z.literal("position") }),
  z.object({ demo: z.literal("verbosity"), conciseCorrect: z.string(), verbosePadded: z.string() }),
  z.object({ demo: z.literal("self_enhancement"), judgeProviderId: z.string(), candidateProviderId: z.string() }),
]);

const JudgeCalibrationBodySchema = z.object({
  cases: z.array(z.object({ caseId: z.string(), humanScore: z.number().min(0).max(1), judgeScore: z.number().min(0).max(1) })),
});

/** `/evals/*` routes from contracts §4 M7. */
const evalsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/datasets", async (req) => {
    const q = parseQuery(ListQuerySchema, req);
    return listDatasets(q);
  });

  app.post("/datasets", async (req, reply) => {
    const body = parseBody(CreateDatasetSchema, req);
    const dataset = await insertDataset(body);
    reply.header("Location", `/api/evals/datasets/${dataset.id}`);
    reply.code(201);
    return dataset;
  });

  app.get("/datasets/:id", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    return requireDataset(id);
  });

  app.put("/datasets/:id", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const patch = parseBody(UpdateDatasetSchema, req);
    return updateDataset(id, patch);
  });

  app.delete("/datasets/:id", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const deleted = await deleteDataset(id);
    if (!deleted) throw notFoundError(`Dataset ${id} not found`);
    return { ok: true };
  });

  app.post("/datasets/:id/import", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const { format, content } = parseBody(ImportBodySchema, req);
    const cases = parseImportContent(format, content);
    const existing = await requireDataset(id);
    const dataset = await updateDataset(id, { cases: [...existing.cases, ...cases] });
    return { imported: cases.length, dataset };
  });

  app.get("/datasets/:id/export", async (req, reply) => {
    const { id } = parseParams(IdParamsSchema, req);
    const { format } = parseQuery(ExportQuerySchema, req);
    const dataset = await requireDataset(id);
    const { body, contentType } = exportDataset(dataset, format ?? "json");
    reply.header("content-type", contentType);
    return body;
  });

  app.post("/run", async (req, reply) => {
    const body = parseBody(RunBodySchema, req);
    // Validate existence BEFORE hijacking the response, so a missing dataset
    // still gets a normal 404 JSON error rather than a broken SSE stream.
    await requireDataset(body.datasetId);

    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    try {
      await runEvalSuite({ ...body, writer });
    } catch (err) {
      writer.send({
        type: "error",
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });

  app.get("/suite-results/:id", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    return requireEvalSuiteResult(id);
  });

  app.get("/suite-results", async (req) => {
    const q = parseQuery(SuiteResultsQuerySchema, req);
    return listEvalSuiteResults(q);
  });

  app.post("/judge-bias-demo", async (req) => {
    const body = parseBody(JudgeBiasDemoBodySchema, req);
    if (body.demo === "position") return demonstratePositionBias();
    if (body.demo === "verbosity") return demonstrateVerbosityBias(body.conciseCorrect, body.verbosePadded);
    return demonstrateSelfEnhancementBias(body.judgeProviderId, body.candidateProviderId);
  });

  app.post("/judge-calibration", async (req) => {
    const { cases } = parseBody(JudgeCalibrationBodySchema, req);
    return calibrateJudge(cases);
  });

  app.post("/ci-check", async (req) => {
    const { suiteResultId, thresholds } = parseBody(CiCheckBodySchema, req);
    const suite = await getEvalSuiteResult(suiteResultId);
    if (!suite) throw notFoundError(`EvalSuiteResult ${suiteResultId} not found`);
    return checkSuiteAgainstThresholds(suite, thresholds);
  });
};

export default evalsRoutes;
