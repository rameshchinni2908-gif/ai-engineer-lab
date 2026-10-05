import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-evals-store.db");

const { closeDb } = await import("../../db/index.js");
const {
  insertDataset,
  getDataset,
  updateDataset,
  deleteDataset,
  listDatasets,
  insertEvalSuiteResult,
} = await import("./store.js");

describe("evals dataset store", () => {
  afterAll(() => closeDb());

  it("creates and retrieves a dataset with its cases", async () => {
    const dataset = await insertDataset({
      name: "fixtures",
      description: "a test dataset",
      cases: [{ id: "c1", input: { prompt: "hi" }, expected: "hello", tags: ["t1"], metadata: {} }],
    });
    expect(dataset.id).toBeTruthy();
    const fetched = await getDataset(dataset.id);
    expect(fetched).toEqual(dataset);
  });

  it("lists datasets with pagination", async () => {
    const result = await listDatasets({ page: 0, pageSize: 100 });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.pageSize).toBe(100);
  });

  it("updates a dataset's name and replaces its cases", async () => {
    const dataset = await insertDataset({ name: "to-update", cases: [{ id: "c1", input: {}, tags: [], metadata: {} }] });
    const updated = await updateDataset(dataset.id, {
      name: "updated-name",
      cases: [{ id: "c2", input: { x: 1 }, tags: [], metadata: {} }],
    });
    expect(updated.name).toBe("updated-name");
    expect(updated.cases).toHaveLength(1);
    expect(updated.cases[0]!.id).toBe("c2");
  });

  it("deletes an unreferenced dataset", async () => {
    const dataset = await insertDataset({ name: "to-delete", cases: [] });
    const deleted = await deleteDataset(dataset.id);
    expect(deleted).toBe(true);
    expect(await getDataset(dataset.id)).toBeUndefined();
  });

  it("refuses to delete a dataset referenced by a stored EvalSuiteResult (409 CONFLICT)", async () => {
    const dataset = await insertDataset({ name: "referenced", cases: [] });
    await insertEvalSuiteResult({
      datasetId: dataset.id,
      variants: [{ promptVersionId: "pv_1", providerId: "mock", model: "mock-small" }],
      rows: [],
      aggregates: [{}],
      regressions: [],
      totalCost: 0,
      totalLatencyMs: 0,
    });
    await expect(deleteDataset(dataset.id)).rejects.toThrow();
  });
});
