import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import type { SseEvent } from "@ail/shared";
import type { SseWriter } from "../../plugins/sse.js";
import { executeMockTool } from "./tool-call.js";
import { MOCK_TOOL_DEFINITIONS } from "./mock-tools.js";

describe("executeMockTool (pure)", () => {
  it("executes a known tool and returns isError:false", () => {
    const result = executeMockTool({ id: "call_1", name: "calculator", arguments: { expr: "2+2" } });
    expect(result.isError).toBe(false);
    expect(result.content).toBe("4");
    expect(result.toolCallId).toBe("call_1");
  });

  it("returns isError:true with a clear message for an unregistered tool name", () => {
    const result = executeMockTool({ id: "call_2", name: "not_a_real_tool", arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/no mock implementation/i);
  });

  it("returns isError:true (never throws) when the tool's own execution fails", () => {
    const result = executeMockTool({ id: "call_3", name: "calculator", arguments: { expr: "not math" } });
    expect(result.isError).toBe(true);
  });
});

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-structured-tool-call.db");
process.env.LLM_PROVIDER = "mock";

const { closeDb } = await import("../../db/index.js");
const { getRun } = await import("../runs/index.js");
const { runToolCallPlayground } = await import("./tool-call.js");

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

describe("runToolCallPlayground (integration, mock provider)", () => {
  afterAll(() => closeDb());

  it("assembles a full message trace (user -> assistant tool_use -> tool_result -> final) on the persisted Run", async () => {
    const { writer, events } = fakeWriter();

    await runToolCallPlayground({
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "What is 2 + 2?" }],
      tools: MOCK_TOOL_DEFINITIONS,
      writer,
    });

    expect(events.some((e) => e.type === "tool_call")).toBe(true);
    expect(events.some((e) => e.type === "tool_result")).toBe(true);
    const runComplete = events.find((e) => e.type === "run_complete");
    expect(runComplete).toBeDefined();
    if (runComplete?.type !== "run_complete") throw new Error("expected run_complete");

    const persisted = await getRun(runComplete.run.id);
    expect(persisted).toBeDefined();
    const roles = persisted!.input.messages.map((m) => m.role);
    expect(roles[0]).toBe("user");
    expect(roles).toContain("assistant");
    expect(roles).toContain("tool");
    // The final persisted run must have a non-empty text answer once the
    // forced-final round (no tools) produces one.
    expect(persisted!.output.text.length).toBeGreaterThan(0);
  });

  it("every tool_call event has a matching tool_result event with the same toolCallId", async () => {
    const { writer, events } = fakeWriter();
    await runToolCallPlayground({
      providerId: "mock",
      model: "mock-small",
      messages: [{ role: "user", content: "Count the words in this sentence" }],
      tools: MOCK_TOOL_DEFINITIONS,
      writer,
    });

    const calls = events.filter((e) => e.type === "tool_call");
    const results = events.filter((e) => e.type === "tool_result");
    expect(calls.length).toBe(results.length);
    for (const call of calls) {
      if (call.type !== "tool_call") continue;
      const match = results.find((r) => r.type === "tool_result" && r.toolResult.toolCallId === call.toolCall.id);
      expect(match).toBeDefined();
    }
  });
});
