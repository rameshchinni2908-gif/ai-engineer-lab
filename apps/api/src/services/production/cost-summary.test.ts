import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-cost-summary.db");

const { closeDb } = await import("../../db/index.js");
const { streamGeneration } = await import("../runs/generation.js");
const { getCostSummary } = await import("./cost-summary.js");

function fakeWriter() {
  return { send() {}, ping() {}, close() {} };
}

describe("cost-summary: aggregates real runs per feature/module", () => {
  afterAll(() => closeDb());

  it("aggregates totalTokens and runCount correctly across multiple runs of the same feature", async () => {
    const feature = `cost-summary-test-${Date.now()}`;
    await streamGeneration({
      moduleId: "production",
      feature,
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "one" }],
      writer: fakeWriter(),
    });
    await streamGeneration({
      moduleId: "production",
      feature,
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "two" }],
      writer: fakeWriter(),
    });

    const { rows } = await getCostSummary({ groupBy: "feature" });
    const row = rows.find((r) => r.key === feature);
    expect(row).toBeDefined();
    expect(row!.runCount).toBe(2);
    expect(row!.totalTokens).toBeGreaterThan(0);
    expect(row!.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("groups by module as an alternative dimension", async () => {
    const { rows } = await getCostSummary({ groupBy: "module" });
    const productionRow = rows.find((r) => r.key === "production");
    expect(productionRow).toBeDefined();
    expect(productionRow!.runCount).toBeGreaterThan(0);
  });

  it("sorts rows by totalCostUsd descending", async () => {
    const { rows } = await getCostSummary({ groupBy: "feature" });
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.totalCostUsd).toBeGreaterThanOrEqual(rows[i]!.totalCostUsd);
    }
  });
});
