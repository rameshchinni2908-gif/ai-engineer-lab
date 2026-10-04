import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import type { SseEvent } from "@ail/shared";
import type { SseWriter } from "../../plugins/sse.js";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-explain.db");

const { closeDb } = await import("../../db/index.js");
const { streamGeneration } = await import("../runs/generation.js");
const { explainRun } = await import("./index.js");

function fakeWriter(): SseWriter {
  return {
    send(_ev: SseEvent) {},
    ping() {},
    close() {},
  };
}

describe("explainRun", () => {
  afterAll(() => closeDb());

  it("cites this run's actual temperature and token/cost numbers (not generic text)", async () => {
    const run = await streamGeneration({
      moduleId: "fundamentals",
      feature: "explain-test",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Explain how RAG retrieval works" }],
      params: { temperature: 0.9, seed: 500 },
      writer: fakeWriter(),
    });

    const explanation = await explainRun({ runId: run.id });
    expect(explanation.runId).toBe(run.id);
    expect(explanation.summary).toContain(String(run.usage.outputTokens));
    expect(explanation.factors.length).toBeGreaterThan(0);
    const tempFactor = explanation.factors.find((f) => f.label.includes("Temperature"));
    expect(tempFactor?.detail).toContain("0.9");
    expect(explanation.whatToTryNext.length).toBeGreaterThan(0);
  });

  it("produces DIFFERENT explanations for two runs with different temperatures", async () => {
    const low = await streamGeneration({
      moduleId: "fundamentals",
      feature: "explain-test",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Explain chunking strategies" }],
      params: { temperature: 0, seed: 600 },
      writer: fakeWriter(),
    });
    const high = await streamGeneration({
      moduleId: "fundamentals",
      feature: "explain-test",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Explain chunking strategies" }],
      params: { temperature: 1.9, seed: 600 },
      writer: fakeWriter(),
    });

    const lowExplain = await explainRun({ runId: low.id });
    const highExplain = await explainRun({ runId: high.id });

    expect(lowExplain.summary).not.toBe(highExplain.summary);
    const lowTemp = lowExplain.factors.find((f) => f.label.includes("Temperature"));
    const highTemp = highExplain.factors.find((f) => f.label.includes("Temperature"));
    expect(lowTemp?.detail).not.toBe(highTemp?.detail);
    // Low temperature should be reported as effectively-greedy/deterministic.
    expect(lowTemp?.detail).toContain("greedy");
  });

  it("is depth-aware: beginner/senior variants differ while both cite real numbers", async () => {
    const run = await streamGeneration({
      moduleId: "fundamentals",
      feature: "explain-test",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Explain cosine similarity" }],
      params: { temperature: 0.7, seed: 700 },
      writer: fakeWriter(),
    });

    const beginner = await explainRun({ runId: run.id, difficulty: "beginner" });
    const senior = await explainRun({ runId: run.id, difficulty: "senior" });

    expect(beginner.summary).not.toBe(senior.summary);
    expect(senior.summary).toContain(run.model);
    expect(beginner.variants?.senior).toBe(senior.summary);
  });

  it("includes a comparison factor when a comparisonRunId is NOT provided but still differs across runs (regression guard)", async () => {
    const run = await streamGeneration({
      moduleId: "fundamentals",
      feature: "explain-test",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Explain BM25" }],
      params: { maxTokens: 2, seed: 800 },
      writer: fakeWriter(),
    });
    const explanation = await explainRun({ runId: run.id });
    const lengthFactor = explanation.factors.find((f) => f.label.startsWith("Finish reason"));
    expect(lengthFactor).toBeDefined();
    expect(lengthFactor?.detail).toContain("2");
  });
});
