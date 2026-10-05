import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-evals-routes.db");
process.env.LLM_PROVIDER = "mock";
process.env.RATE_LIMIT_MAX = "1000";

const { buildApp } = await import("../../app.js");
const { closeDb, getDb } = await import("../../db/index.js");
const { insertEvalSuiteResult } = await import("../../services/evals/store.js");

describe("evals routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  it("creates, fetches, lists, updates, and deletes a dataset", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/evals/datasets",
      payload: {
        name: "route-test-dataset",
        cases: [{ id: "c1", input: { prompt: "hi" }, expected: "hello", tags: [], metadata: {} }],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const dataset = createRes.json();
    expect(dataset.id).toBeTruthy();
    expect(createRes.headers.location).toContain(dataset.id);

    const getRes = await app.inject({ method: "GET", url: `/api/evals/datasets/${dataset.id}` });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe("route-test-dataset");

    const listRes = await app.inject({ method: "GET", url: "/api/evals/datasets" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items.length).toBeGreaterThan(0);

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/evals/datasets/${dataset.id}`,
      payload: { name: "renamed" },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().name).toBe("renamed");

    const deleteRes = await app.inject({ method: "DELETE", url: `/api/evals/datasets/${dataset.id}` });
    expect(deleteRes.statusCode).toBe(200);

    const missingRes = await app.inject({ method: "GET", url: `/api/evals/datasets/${dataset.id}` });
    expect(missingRes.statusCode).toBe(404);
  });

  it("409s deleting a dataset referenced by a stored EvalSuiteResult", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/evals/datasets",
      payload: { name: "referenced-dataset", cases: [] },
    });
    const dataset = createRes.json();
    await insertEvalSuiteResult({
      datasetId: dataset.id,
      variants: [{ promptVersionId: "pv_1", providerId: "mock", model: "mock-small" }],
      rows: [],
      aggregates: [{}],
      regressions: [],
      totalCost: 0,
      totalLatencyMs: 0,
    });
    const deleteRes = await app.inject({ method: "DELETE", url: `/api/evals/datasets/${dataset.id}` });
    expect(deleteRes.statusCode).toBe(409);
  });

  it("imports CSV content and merges it into the dataset's cases", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/evals/datasets",
      payload: { name: "csv-import-dataset", cases: [] },
    });
    const dataset = createRes.json();

    const csv = 'id,prompt,expected\nc1,"Hello, world",hi';
    const importRes = await app.inject({
      method: "POST",
      url: `/api/evals/datasets/${dataset.id}/import`,
      payload: { format: "csv", content: csv },
    });
    expect(importRes.statusCode).toBe(200);
    expect(importRes.json().imported).toBe(1);
    expect(importRes.json().dataset.cases[0].input.prompt).toBe("Hello, world");
  });

  it("exports a dataset as JSON and as CSV with the right content-type", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/evals/datasets",
      payload: {
        name: "export-dataset",
        cases: [{ id: "c1", input: { prompt: "hi" }, expected: "hello", tags: [], metadata: {} }],
      },
    });
    const dataset = createRes.json();

    const jsonRes = await app.inject({ method: "GET", url: `/api/evals/datasets/${dataset.id}/export?format=json` });
    expect(jsonRes.statusCode).toBe(200);
    expect(JSON.parse(jsonRes.body).name).toBe("export-dataset");

    const csvRes = await app.inject({ method: "GET", url: `/api/evals/datasets/${dataset.id}/export?format=csv` });
    expect(csvRes.statusCode).toBe(200);
    expect(csvRes.headers["content-type"]).toContain("text/csv");
    expect(csvRes.body).toContain("prompt");
  });

  it("404s GET /evals/datasets/:id for a missing dataset", async () => {
    const res = await app.inject({ method: "GET", url: "/api/evals/datasets/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  it("POST /evals/run 404s immediately for a missing dataset (never opens the SSE stream)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/evals/run",
      payload: { datasetId: "does-not-exist", variants: [{ promptVersionId: "pv_1", providerId: "mock", model: "mock-small" }], metricIds: ["exact_match"] },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
  });

  it("POST /evals/ci-check reports pass/fail with specific failure details", async () => {
    const suite = await insertEvalSuiteResult({
      datasetId: "dataset_x",
      variants: [{ promptVersionId: "pv_1", providerId: "mock", model: "mock-small" }],
      rows: [],
      aggregates: [{ exact_match: 0.4 }],
      regressions: [],
      totalCost: 0,
      totalLatencyMs: 0,
    });

    const passRes = await app.inject({
      method: "POST",
      url: "/api/evals/ci-check",
      payload: { suiteResultId: suite.id, thresholds: { exact_match: 0.2 } },
    });
    expect(passRes.statusCode).toBe(200);
    expect(passRes.json().pass).toBe(true);

    const failRes = await app.inject({
      method: "POST",
      url: "/api/evals/ci-check",
      payload: { suiteResultId: suite.id, thresholds: { exact_match: 0.8 } },
    });
    expect(failRes.statusCode).toBe(200);
    expect(failRes.json().pass).toBe(false);
    expect(failRes.json().failures[0]).toMatchObject({ metricId: "exact_match", variantIndex: 0 });
  });

  it("POST /evals/run streams a full SSE suite run end to end", async () => {
    const db = await getDb();
    db.prepare(
      `INSERT OR REPLACE INTO prompt_versions (id, name, version, template, variables, system, notes, created_at, parent_version_id, tags)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run("pv_route_test", "pv_route_test", 1, "Say hi.", "[]", null, null, new Date().toISOString(), null, "[]");

    const createRes = await app.inject({
      method: "POST",
      url: "/api/evals/datasets",
      payload: { name: "sse-run-dataset", cases: [{ id: "c1", input: {}, expected: "hi", tags: [], metadata: {} }] },
    });
    const dataset = createRes.json();

    const runRes = await app.inject({
      method: "POST",
      url: "/api/evals/run",
      headers: { accept: "text/event-stream" },
      payload: {
        datasetId: dataset.id,
        variants: [{ promptVersionId: "pv_route_test", providerId: "mock", model: "mock-small" }],
        metricIds: ["exact_match"],
      },
    });
    expect(runRes.statusCode).toBe(200);
    expect(runRes.headers["content-type"]).toContain("text/event-stream");
    expect(runRes.body).toContain("event: run_start");
    expect(runRes.body).toContain("event: progress");
    expect(runRes.body).toContain("event: run_complete");
    expect(runRes.body).toContain("event: done");
  });

  it("POST /evals/judge-bias-demo runs each bias demo type", async () => {
    const position = await app.inject({ method: "POST", url: "/api/evals/judge-bias-demo", payload: { demo: "position" } });
    expect(position.statusCode).toBe(200);
    expect(position.json().biasDetected).toBe(true);

    const verbosity = await app.inject({
      method: "POST",
      url: "/api/evals/judge-bias-demo",
      payload: { demo: "verbosity", conciseCorrect: "Paris.", verbosePadded: "Well, after much thought, the answer is clearly and obviously Paris, the capital city." },
    });
    expect(verbosity.statusCode).toBe(200);
    expect(verbosity.json().naiveScore).toBeGreaterThan(verbosity.json().lengthNormalizedScore);

    const selfEnhancement = await app.inject({
      method: "POST",
      url: "/api/evals/judge-bias-demo",
      payload: { demo: "self_enhancement", judgeProviderId: "anthropic", candidateProviderId: "anthropic" },
    });
    expect(selfEnhancement.statusCode).toBe(200);
    expect(selfEnhancement.json().biasDetected).toBe(true);
  });

  it("POST /evals/judge-calibration reports agreement against human-labelled cases", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/evals/judge-calibration",
      payload: { cases: [{ caseId: "c1", humanScore: 0.9, judgeScore: 0.9 }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().agreementRate).toBe(1);
  });
});
