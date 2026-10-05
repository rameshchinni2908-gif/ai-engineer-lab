import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import type { SseEvent } from "@ail/shared";
import type { SseWriter } from "../../plugins/sse.js";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-synthetic-data.db");

const { closeDb } = await import("../../db/index.js");
const { dedupeAndFilter, runSyntheticDataGeneration } = await import("./synthetic-data.js");

function collectingWriter(): { writer: SseWriter; events: SseEvent[] } {
  const events: SseEvent[] = [];
  return {
    events,
    writer: {
      send(ev) {
        events.push(ev);
      },
      ping() {},
      close() {},
    },
  };
}

describe("dedupeAndFilter: pure dedup + quality filter logic", () => {
  it("drops an exact-duplicate example, keeping the first occurrence", () => {
    const result = dedupeAndFilter([
      { index: 0, example: { text: "same thing here" } },
      { index: 1, example: { text: "same thing here" } },
    ]);
    expect(result[0]!.keptAfterFiltering).toBe(true);
    expect(result[1]!.keptAfterFiltering).toBe(false);
    expect(result[1]!.filteredReason).toBe("duplicate");
  });

  it("drops an example below the minimum quality length", () => {
    const result = dedupeAndFilter([{ index: 0, example: { text: "" } }]);
    expect(result[0]!.keptAfterFiltering).toBe(false);
    expect(result[0]!.filteredReason).toBe("too-short");
  });

  it("keeps distinct, sufficiently long examples", () => {
    const result = dedupeAndFilter([
      { index: 0, example: { text: "the first distinct example" } },
      { index: 1, example: { text: "a second, genuinely different example" } },
    ]);
    expect(result.every((r) => r.keptAfterFiltering)).toBe(true);
  });
});

describe("runSyntheticDataGeneration: streaming integration", () => {
  afterAll(() => closeDb());

  it("emits one 'synthetic.example' stage per requested example, then a 'synthetic.filtered' summary", async () => {
    const { writer, events } = collectingWriter();
    const result = await runSyntheticDataGeneration({
      seedExamples: [{ text: "seed one" }, { text: "seed two" }],
      count: 3,
      providerId: "mock",
      model: "mock-small",
      writer,
    });

    const exampleStages = events.filter((e) => e.type === "stage" && e.stage === "synthetic.example");
    expect(exampleStages).toHaveLength(3);
    const filterStage = events.find((e) => e.type === "stage" && e.stage === "synthetic.filtered");
    expect(filterStage).toBeDefined();

    expect(result.generated).toHaveLength(3);
    expect(result.kept.length).toBeLessThanOrEqual(3);
  });

  it("persists a wrapper Run whose output.parsedJson holds the full kept array", async () => {
    const { writer } = collectingWriter();
    const { getRun } = await import("../runs/store.js");
    const result = await runSyntheticDataGeneration({
      seedExamples: [{ text: "seed" }],
      count: 2,
      providerId: "mock",
      model: "mock-small",
      writer,
    });
    const run = await getRun(result.runId);
    expect(run).toBeDefined();
    expect(run!.output.parsedJson).toEqual(result.kept);
    expect(run!.status).toBe("complete");
  });

  it("each per-example generation is its own separately persisted Run", async () => {
    const { writer } = collectingWriter();
    const { getRun } = await import("../runs/store.js");
    const result = await runSyntheticDataGeneration({
      seedExamples: [{ text: "seed" }],
      count: 2,
      providerId: "mock",
      model: "mock-small",
      writer,
    });
    for (const g of result.generated) {
      const exampleRun = await getRun(g.runId);
      expect(exampleRun).toBeDefined();
      expect(exampleRun!.feature).toBe("synthetic-data-example");
    }
  });
});
