import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import type { SseEvent } from "@ail/shared";
import type { SseWriter } from "../../plugins/sse.js";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-evals-runner.db");
process.env.LLM_PROVIDER = "mock";

const { closeDb, getDb } = await import("../../db/index.js");
const { runGenerationOnce } = await import("../runs/index.js");
const { insertDataset } = await import("./store.js");
const { runEvalSuite } = await import("./runner.js");
const { getEvalSuiteResult } = await import("./store.js");

function capturingWriter(): { writer: SseWriter; events: SseEvent[] } {
  const events: SseEvent[] = [];
  return {
    events,
    writer: {
      send(ev: SseEvent) {
        events.push(ev);
      },
      ping() {},
      close() {},
    },
  };
}

async function insertPromptVersion(id: string, template: string, system?: string): Promise<void> {
  const db = await getDb();
  db.prepare(
    `INSERT OR REPLACE INTO prompt_versions (id, name, version, template, variables, system, notes, created_at, parent_version_id, tags)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, id, 1, template, "[]", system ?? null, null, new Date().toISOString(), null, "[]");
}

describe("runEvalSuite", () => {
  afterAll(() => closeDb());

  it("runs case x variant, scores exact_match, detects a regression, persists, and streams run_start/progress/run_complete", async () => {
    await insertPromptVersion("pv_baseline", "Summarize topic Alpha in one word.");
    await insertPromptVersion("pv_worse", "Summarize topic Zeta in one word, completely differently.");

    // Capture variant A's actual deterministic mock output so the test
    // doesn't depend on guessing MockProvider's internal corpus - this makes
    // variant A's exact_match score deterministically 1 (same prompt+model
    // always reproduces the same text) while variant B (a different
    // template) almost certainly scores 0, giving a reliable regression.
    const baselineRun = await runGenerationOnce({
      moduleId: "evals",
      feature: "eval-case",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Summarize topic Alpha in one word." }],
    });

    const dataset = await insertDataset({
      name: "runner-test-dataset",
      cases: [{ id: "case_1", input: {}, expected: baselineRun.output.text, tags: [], metadata: {} }],
    });

    const { writer, events } = capturingWriter();
    const suite = await runEvalSuite({
      datasetId: dataset.id,
      variants: [
        { promptVersionId: "pv_baseline", providerId: "mock", model: "mock-small" },
        { promptVersionId: "pv_worse", providerId: "mock", model: "mock-small" },
      ],
      metricIds: ["exact_match"],
      writer,
    });

    expect(suite.aggregates).toHaveLength(2);
    expect(suite.aggregates[0]!.exact_match).toBe(1);
    expect(suite.aggregates[1]!.exact_match).toBe(0);
    expect(suite.regressions).toEqual([
      { metricId: "exact_match", fromVariantIndex: 0, toVariantIndex: 1, delta: -1 },
    ]);
    expect(suite.rows).toHaveLength(2); // 1 case x 2 variants x 1 metric

    const persisted = await getEvalSuiteResult(suite.id);
    expect(persisted?.id).toBe(suite.id);

    expect(events.find((e) => e.type === "run_start")).toBeDefined();
    const progressEvents = events.filter((e) => e.type === "progress");
    expect(progressEvents).toHaveLength(2); // 1 case x 2 variants
    const complete = events.find((e) => e.type === "run_complete");
    expect(complete).toBeDefined();
    if (complete?.type === "run_complete") {
      expect(complete.run.output.parsedJson).toMatchObject({ id: suite.id });
    }
  });

  it("llm_judge metric records a judgeRunId and a meaningful (non-flat) score via the mock heuristic fallback", async () => {
    await insertPromptVersion("pv_judge", "Say the capital of France.");
    const dataset = await insertDataset({
      name: "runner-judge-dataset",
      cases: [
        { id: "good", input: {}, expected: "Paris is the capital of France.", tags: [], metadata: {} },
      ],
    });

    const { writer } = capturingWriter();
    const suite = await runEvalSuite({
      datasetId: dataset.id,
      variants: [{ promptVersionId: "pv_judge", providerId: "mock", model: "mock-small" }],
      metricIds: ["llm_judge"],
      writer,
    });

    expect(suite.rows).toHaveLength(1);
    expect(suite.rows[0]!.judgeRunId).toBeTruthy();
    expect(suite.rows[0]!.judgeRunId).not.toBe(suite.rows[0]!.runId);
  });

  it("pairwise metric skips the baseline variant and scores subsequent variants against it", async () => {
    await insertPromptVersion("pv_pw_a", "Respond with the word yes.");
    await insertPromptVersion("pv_pw_b", "Respond with the word no.");
    const dataset = await insertDataset({
      name: "runner-pairwise-dataset",
      cases: [{ id: "c1", input: {}, expected: "yes", tags: [], metadata: {} }],
    });

    const { writer } = capturingWriter();
    const suite = await runEvalSuite({
      datasetId: dataset.id,
      variants: [
        { promptVersionId: "pv_pw_a", providerId: "mock", model: "mock-small" },
        { promptVersionId: "pv_pw_b", providerId: "mock", model: "mock-small" },
      ],
      metricIds: ["pairwise"],
      writer,
    });

    // Variant 0 (baseline) has nothing to compare against -> no pairwise row for it.
    expect(suite.aggregates[0]!.pairwise).toBeUndefined();
    // Variant 1 was compared against the baseline and has a pairwise score.
    expect(suite.aggregates[1]!.pairwise).toBeDefined();
  });

  it("rag_* metrics score using case.input.context/query and case.expected", async () => {
    await insertPromptVersion("pv_rag", "Answer the question using the context.");
    const dataset = await insertDataset({
      name: "runner-rag-dataset",
      cases: [
        {
          id: "c1",
          input: { query: "What is the capital of France?", context: ["Paris is the capital of France."] },
          expected: "Paris is the capital of France.",
          tags: [],
          metadata: {},
        },
      ],
    });

    const { writer } = capturingWriter();
    const suite = await runEvalSuite({
      datasetId: dataset.id,
      variants: [{ promptVersionId: "pv_rag", providerId: "mock", model: "mock-small" }],
      metricIds: ["rag_context_precision", "rag_context_recall"],
      writer,
    });

    expect(suite.aggregates[0]!.rag_context_precision).toBeGreaterThan(0);
    expect(suite.aggregates[0]!.rag_context_recall).toBeGreaterThan(0);
  });

  it("latency and cost metrics score using the case run's real measured values", async () => {
    await insertPromptVersion("pv_cost", "Say hi.");
    const dataset = await insertDataset({
      name: "runner-cost-dataset",
      cases: [{ id: "c1", input: {}, tags: [], metadata: { latencyThresholdMs: 100000, costThresholdUsd: 100 } }],
    });

    const { writer } = capturingWriter();
    const suite = await runEvalSuite({
      datasetId: dataset.id,
      variants: [{ promptVersionId: "pv_cost", providerId: "mock", model: "mock-small" }],
      metricIds: ["latency", "cost"],
      writer,
    });

    expect(suite.aggregates[0]!.latency).toBe(1);
    expect(suite.aggregates[0]!.cost).toBe(1);
    expect(suite.totalCost).toBeGreaterThanOrEqual(0);
    expect(suite.totalLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
