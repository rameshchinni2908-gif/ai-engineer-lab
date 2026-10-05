import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import { buildForcedResultTool, extractCandidateJson } from "./generate.js";

describe("extractCandidateJson (pure)", () => {
  it("parses valid JSON text for json_mode/schema_constrained", () => {
    const { parsed, value } = extractCandidateJson("json_mode", { text: '{"a":1}' });
    expect(parsed).toBe(true);
    expect(value).toEqual({ a: 1 });
  });

  it("reports parsed:false for malformed JSON text, without throwing", () => {
    const { parsed } = extractCandidateJson("json_mode", { text: "not json at all" });
    expect(parsed).toBe(false);
  });

  it("extracts the forced tool call's arguments directly for forced_tool mode", () => {
    const { parsed, value } = extractCandidateJson("forced_tool", {
      text: "",
      toolCalls: [{ arguments: { amount: 5 } }],
    });
    expect(parsed).toBe(true);
    expect(value).toEqual({ amount: 5 });
  });

  it("reports parsed:false for forced_tool mode when no tool call was made", () => {
    const { parsed } = extractCandidateJson("forced_tool", { text: "" });
    expect(parsed).toBe(false);
  });
});

describe("buildForcedResultTool (pure)", () => {
  it("names the synthetic tool emit_result and carries the given schema", () => {
    const tool = buildForcedResultTool({ type: "object" });
    expect(tool.name).toBe("emit_result");
    expect(tool.inputSchema).toEqual({ type: "object" });
  });

  it("falls back to an empty schema when none is given", () => {
    const tool = buildForcedResultTool(undefined);
    expect(tool.inputSchema).toEqual({});
  });
});

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-structured-generate.db");
process.env.LLM_PROVIDER = "mock";

const { closeDb } = await import("../../db/index.js");
const { getRun } = await import("../runs/index.js");
const { runStructuredGenerate } = await import("./generate.js");

function fakeWriter() {
  const events: unknown[] = [];
  return {
    events,
    writer: {
      send: (ev: unknown) => {
        events.push(ev);
      },
      ping: () => {},
      close: () => {},
    },
  };
}

describe("runStructuredGenerate (integration, mock provider)", () => {
  afterAll(() => closeDb());

  it("json_mode: persists output.parsedJson on the Run once JSON parses successfully", async () => {
    const { writer, events } = fakeWriter();
    await runStructuredGenerate({
      mode: "json_mode",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Describe embeddings as JSON" }],
      writer: writer as never,
    });

    const stageEvent = events.find(
      (e): e is { type: string; data: { parsed: boolean } } =>
        typeof e === "object" && e !== null && (e as { type?: string }).type === "stage",
    );
    expect(stageEvent?.data.parsed).toBe(true);
  });

  it("forced_tool: the run's output.toolCalls carries the structured arguments", async () => {
    const { writer, events } = fakeWriter();
    await runStructuredGenerate({
      mode: "forced_tool",
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Give me structured data" }],
      responseSchema: { type: "object" },
      writer: writer as never,
    });

    const runComplete = events.find(
      (e): e is { type: string; run: { id: string; output: { toolCalls?: unknown[] } } } =>
        typeof e === "object" && e !== null && (e as { type?: string }).type === "run_complete",
    );
    expect(runComplete).toBeDefined();
    const persisted = await getRun(runComplete!.run.id);
    expect(persisted?.output.toolCalls?.length).toBeGreaterThan(0);
  });
});
