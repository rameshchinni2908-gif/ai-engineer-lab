import { randomUUID } from "node:crypto";
import type { CostBreakdown, EvalResult, EvalSuiteResult, EvalVariant, MetricId, TokenUsage } from "@ail/shared";
import type { SseWriter } from "../../plugins/sse.js";
import { getProvider } from "../../providers/registry.js";
import { notFoundError } from "../../middleware/errors.js";
import { runGenerationOnce, insertRun, withSpan } from "../runs/index.js";
import { requireDataset, insertEvalResult, insertEvalSuiteResult, getPromptVersionLite } from "./store.js";
import { renderTemplate } from "./renderTemplate.js";
import { aggregateVariantScores, detectRegressions } from "./aggregate.js";
import { exactMatch } from "./metrics/exactMatch.js";
import { regexMatch } from "./metrics/regexMatch.js";
import { jsonSchemaValidMetric } from "./metrics/jsonSchemaValid.js";
import { semanticSimilarity } from "./metrics/semanticSimilarity.js";
import {
  DEFAULT_JUDGE_RUBRIC,
  buildJudgePrompt,
  heuristicJudgeScore,
  parseJudgeResponse,
} from "./metrics/llmJudge.js";
import { buildPairwisePrompt, heuristicPairwiseVerdict, pairwiseScore, parsePairwiseResponse } from "./metrics/pairwise.js";
import { ragAnswerRelevance, ragContextPrecision, ragContextRecall, ragFaithfulness, toContextArray } from "./metrics/rag.js";
import { costMetric, latencyMetric } from "./metrics/latencyCost.js";

export interface RunEvalSuiteArgs {
  datasetId: string;
  variants: EvalVariant[];
  metricIds: MetricId[];
  judgeRubric?: string;
  writer: SseWriter;
}

function stringifyExpected(expected: unknown): string | undefined {
  if (expected === undefined) return undefined;
  return typeof expected === "string" ? expected : JSON.stringify(expected);
}

function zeroUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

/**
 * Orchestrates `POST /evals/run`: renders each case's prompt per variant,
 * runs it (recording a `Run`), scores every requested metric (recording
 * judge calls as their own `Run` with `judgeRunId` set), aggregates, detects
 * regressions against variant 0 as the baseline, persists the
 * `EvalSuiteResult`, and streams `progress` + the final synthetic wrapper
 * `run_complete`. Does not send the connection-level `done` - the caller
 * (the route) does, per the streamGeneration convention.
 */
export async function runEvalSuite(args: RunEvalSuiteArgs): Promise<EvalSuiteResult> {
  const { writer } = args;
  const dataset = await requireDataset(args.datasetId);
  const rubric = args.judgeRubric ?? DEFAULT_JUDGE_RUBRIC;
  const suiteRunId = `run_${randomUUID()}`;
  writer.send({ type: "run_start", runId: suiteRunId });

  return withSpan(
    "eval.run",
    "internal",
    { datasetId: args.datasetId, variantCount: args.variants.length, metricIds: args.metricIds },
    async ({ traceId }) => {
      const totalCases = dataset.cases.length;
      const totalVariants = args.variants.length;
      const totalSteps = Math.max(totalCases * totalVariants, 1);
      let stepCount = 0;
      let totalCost = 0;
      let totalLatencyMs = 0;

      const allRows: EvalResult[] = [];
      const perVariantScores: Partial<Record<MetricId, number[]>>[] = args.variants.map(() => ({}));
      const baselineOutputs = new Map<string, string>();

      for (let vi = 0; vi < args.variants.length; vi++) {
        const variant = args.variants[vi]!;
        const promptVersion = await getPromptVersionLite(variant.promptVersionId);
        if (!promptVersion) {
          throw notFoundError(`PromptVersion ${variant.promptVersionId} not found`);
        }

        for (let ci = 0; ci < dataset.cases.length; ci++) {
          const evalCase = dataset.cases[ci]!;
          const rendered = renderTemplate(promptVersion.template, evalCase.input);

          const caseRun = await withSpan(
            "eval.case",
            "llm_call",
            { datasetId: args.datasetId, caseId: evalCase.id, variantIndex: vi },
            () =>
              runGenerationOnce({
                moduleId: "evals",
                feature: "eval-case",
                providerId: variant.providerId,
                model: variant.model,
                messages: [{ role: "user", content: rendered }],
                system: promptVersion.system,
                traceId,
                tags: ["eval-case"],
                metadata: { datasetId: args.datasetId, caseId: evalCase.id, variantIndex: vi },
              }),
            { traceId },
          );

          const outputText = caseRun.output.text;
          totalCost += caseRun.cost.totalCostUsd;
          totalLatencyMs += caseRun.latencyMs;
          if (vi === 0) baselineOutputs.set(evalCase.id, outputText);

          stepCount++;
          writer.send({
            type: "progress",
            runId: suiteRunId,
            percent: Math.round((stepCount / totalSteps) * 100),
            message: `case ${ci + 1}/${totalCases}, variant ${vi + 1}/${totalVariants}`,
          });

          for (const metricId of args.metricIds) {
            const scored = await scoreMetric({
              metricId,
              rubric,
              rendered,
              outputText,
              parsedJson: caseRun.output.parsedJson,
              evalCase,
              variant,
              traceId,
              caseRunLatencyMs: caseRun.latencyMs,
              caseRunCostUsd: caseRun.cost.totalCostUsd,
              baselineOutput: vi === 0 ? undefined : baselineOutputs.get(evalCase.id),
              onJudgeRunCost: (c, l) => {
                totalCost += c;
                totalLatencyMs += l;
              },
            });
            if (scored === undefined) continue; // metric not applicable to this case/variant (e.g. pairwise on the baseline itself)

            const result = await insertEvalResult({
              datasetId: args.datasetId,
              caseId: evalCase.id,
              runId: caseRun.id,
              metricId,
              score: scored.score,
              passed: scored.score >= 0.5,
              rationale: scored.rationale,
              judgeRunId: scored.judgeRunId,
            });
            allRows.push(result);
            const bucket = (perVariantScores[vi]![metricId] ??= []);
            bucket.push(scored.score);
          }
        }
      }

      const aggregates = perVariantScores.map(aggregateVariantScores);
      const regressions = detectRegressions(aggregates, args.metricIds);

      const suite = await insertEvalSuiteResult({
        datasetId: args.datasetId,
        variants: args.variants,
        rows: allRows,
        aggregates,
        regressions,
        totalCost,
        totalLatencyMs,
      });

      const cost: CostBreakdown = { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: totalCost, currency: "USD" };
      const wrapperRun = await insertRun({
        id: suiteRunId,
        moduleId: "evals",
        feature: "eval-suite",
        providerId: args.variants[0]?.providerId ?? "mock",
        model: "eval-suite",
        params: {},
        input: { messages: [] },
        output: {
          text: `Eval suite complete: ${totalCases} cases x ${totalVariants} variants, ${regressions.length} regression(s) detected.`,
          parsedJson: suite,
        },
        usage: zeroUsage(),
        cost,
        latencyMs: totalLatencyMs,
        status: "complete",
        completedAt: new Date().toISOString(),
        traceId,
        tags: ["eval-suite"],
        metadata: { datasetId: args.datasetId, suiteResultId: suite.id },
      });

      writer.send({ type: "run_complete", runId: suiteRunId, run: wrapperRun });
      return suite;
    },
    {},
  );
}

interface ScoreMetricArgs {
  metricId: MetricId;
  rubric: string;
  rendered: string;
  outputText: string;
  parsedJson: unknown;
  evalCase: { input: Record<string, unknown>; expected?: unknown; metadata: Record<string, unknown> };
  variant: EvalVariant;
  traceId: string;
  caseRunLatencyMs: number;
  caseRunCostUsd: number;
  baselineOutput?: string;
  onJudgeRunCost: (costUsd: number, latencyMs: number) => void;
}

interface ScoredMetric {
  score: number;
  rationale?: string;
  judgeRunId?: string;
}

/** Dispatches one `MetricId` to its scorer. Judge-based metrics (`llm_judge`, `pairwise`) make their own provider call and persist their own `Run`. */
async function scoreMetric(args: ScoreMetricArgs): Promise<ScoredMetric | undefined> {
  const { metricId, evalCase, outputText, variant } = args;
  const expectedText = stringifyExpected(evalCase.expected);

  switch (metricId) {
    case "exact_match":
      return exactMatch(outputText, evalCase.expected);
    case "regex":
      return regexMatch(outputText, evalCase.expected);
    case "json_schema_valid": {
      const schema = (evalCase.metadata?.schema as unknown) ?? evalCase.expected;
      const candidate = args.parsedJson ?? tryParseJsonLoose(outputText);
      return jsonSchemaValidMetric(candidate, schema);
    }
    case "semantic_similarity": {
      const provider = getProvider(variant.providerId);
      const embedder = provider.embed ? provider : getProvider("mock");
      const [outVec, expVec] = await embedder.embed!([outputText, expectedText ?? ""], variant.model);
      return semanticSimilarity(outVec!, expVec!);
    }
    case "llm_judge": {
      const prompt = buildJudgePrompt({ rubric: args.rubric, input: args.rendered, output: outputText, expected: expectedText });
      const judgeRun = await runGenerationOnce({
        moduleId: "evals",
        feature: "eval-judge",
        providerId: variant.providerId,
        model: variant.model,
        messages: [{ role: "user", content: prompt }],
        traceId: args.traceId,
        tags: ["eval-judge"],
      });
      args.onJudgeRunCost(judgeRun.cost.totalCostUsd, judgeRun.latencyMs);
      const verdict =
        variant.providerId === "mock"
          ? heuristicJudgeScore(outputText, expectedText)
          : parseJudgeResponse(judgeRun.output.text);
      return { score: verdict.score, rationale: verdict.rationale, judgeRunId: judgeRun.id };
    }
    case "pairwise": {
      if (args.baselineOutput === undefined) return undefined; // nothing to compare the baseline variant against
      const prompt = buildPairwisePrompt({ input: args.rendered, a: args.baselineOutput, b: outputText });
      const judgeRun = await runGenerationOnce({
        moduleId: "evals",
        feature: "eval-judge-pairwise",
        providerId: variant.providerId,
        model: variant.model,
        messages: [{ role: "user", content: prompt }],
        traceId: args.traceId,
        tags: ["eval-judge", "pairwise"],
      });
      args.onJudgeRunCost(judgeRun.cost.totalCostUsd, judgeRun.latencyMs);
      const verdict =
        variant.providerId === "mock"
          ? heuristicPairwiseVerdict(args.baselineOutput, outputText, expectedText)
          : parsePairwiseResponse(judgeRun.output.text);
      return { score: pairwiseScore(verdict, "B"), rationale: verdict.rationale, judgeRunId: judgeRun.id };
    }
    case "rag_faithfulness": {
      const contexts = toContextArray(evalCase.input.context);
      if (contexts.length === 0) return { score: 0, rationale: "No retrieved context present on this case." };
      return ragFaithfulness(outputText, contexts);
    }
    case "rag_answer_relevance":
      return ragAnswerRelevance(outputText, String(evalCase.input.query ?? ""));
    case "rag_context_precision": {
      const contexts = toContextArray(evalCase.input.context);
      return ragContextPrecision(contexts, expectedText ?? "");
    }
    case "rag_context_recall": {
      const contexts = toContextArray(evalCase.input.context);
      return ragContextRecall(contexts, expectedText ?? "");
    }
    case "latency": {
      const threshold = Number(evalCase.metadata?.latencyThresholdMs);
      return latencyMetric(args.caseRunLatencyMs, Number.isFinite(threshold) && threshold > 0 ? threshold : undefined);
    }
    case "cost": {
      const threshold = Number(evalCase.metadata?.costThresholdUsd);
      return costMetric(args.caseRunCostUsd, Number.isFinite(threshold) && threshold > 0 ? threshold : undefined);
    }
  }
}

function tryParseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
