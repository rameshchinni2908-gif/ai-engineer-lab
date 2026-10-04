import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import type { SseEvent } from "@ail/shared";
import type { SseWriter } from "../../plugins/sse.js";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-generation.db");
process.env.LLM_PROVIDER = "mock";

const { closeDb } = await import("../../db/index.js");
const { streamGeneration, runGenerationOnce, replayRun } = await import("./generation.js");
const { compareRuns, getRun } = await import("./index.js");

function fakeWriter(): { writer: SseWriter; events: SseEvent[] } {
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

describe("streamGeneration", () => {
  afterAll(() => closeDb());

  it("persists the run BEFORE run_complete, so run.id === runId", async () => {
    const { writer, events } = fakeWriter();
    const run = await streamGeneration({
      moduleId: "fundamentals",
      feature: "sampling-lab-test",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Explain embeddings" }],
      params: { temperature: 0.5, seed: 1 },
      writer,
    });

    const runStart = events.find((e) => e.type === "run_start");
    const runComplete = events.find((e) => e.type === "run_complete");
    expect(runStart).toBeDefined();
    expect(runComplete).toBeDefined();
    if (runComplete?.type === "run_complete") {
      expect(runComplete.run.id).toBe(run.id);
      expect(runComplete.runId).toBe(run.id);
    }

    const persisted = await getRun(run.id);
    expect(persisted?.status).toBe("complete");
    expect(persisted?.usage.outputTokens).toBeGreaterThan(0);
  });

  it("emits token events before run_complete (streaming order)", async () => {
    const { writer, events } = fakeWriter();
    await streamGeneration({
      moduleId: "fundamentals",
      feature: "sampling-lab-test",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Explain RAG" }],
      params: { temperature: 0.5, seed: 2 },
      writer,
    });
    const tokenIdx = events.findIndex((e) => e.type === "token");
    const completeIdx = events.findIndex((e) => e.type === "run_complete");
    expect(tokenIdx).toBeGreaterThanOrEqual(0);
    expect(tokenIdx).toBeLessThan(completeIdx);
  });
});

describe("runGenerationOnce", () => {
  afterAll(() => closeDb());

  it("records a complete Run from a single non-streaming provider call", async () => {
    const run = await runGenerationOnce({
      moduleId: "prompting",
      feature: "coach-test",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Improve this prompt" }],
      params: { seed: 3 },
    });
    expect(run.status).toBe("complete");
    expect(run.output.text.length).toBeGreaterThan(0);
  });
});

describe("replayRun", () => {
  afterAll(() => closeDb());

  it("creates a NEW run id and does not mutate the original", async () => {
    const { writer } = fakeWriter();
    const original = await streamGeneration({
      moduleId: "fundamentals",
      feature: "replay-source",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Explain chunking" }],
      params: { temperature: 0.3, seed: 10 },
      writer,
    });

    const { writer: replayWriter } = fakeWriter();
    const replayed = await replayRun({ runId: original.id, writer: replayWriter });

    expect(replayed.id).not.toBe(original.id);
    expect(replayed.metadata.replayOf).toBe(original.id);
    const stillOriginal = await getRun(original.id);
    expect(stillOriginal?.id).toBe(original.id);
    expect(stillOriginal?.metadata.replayOf).toBeUndefined();
  });
});

describe("compareRuns", () => {
  afterAll(() => closeDb());

  it("computes a field-path diff between two runs with different temperatures", async () => {
    const { writer: w1 } = fakeWriter();
    const { writer: w2 } = fakeWriter();
    const runA = await streamGeneration({
      moduleId: "fundamentals",
      feature: "compare-test",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Explain vector search" }],
      params: { temperature: 0.1, seed: 99 },
      writer: w1,
    });
    const runB = await streamGeneration({
      moduleId: "fundamentals",
      feature: "compare-test",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Explain vector search" }],
      params: { temperature: 1.6, seed: 99 },
      writer: w2,
    });

    const { diff } = await compareRuns(runA.id, runB.id);
    const tempDiff = diff.find((d) => d.field === "params.temperature");
    expect(tempDiff).toBeDefined();
    expect(tempDiff?.aValue).toBe(0.1);
    expect(tempDiff?.bValue).toBe(1.6);
  });
});
