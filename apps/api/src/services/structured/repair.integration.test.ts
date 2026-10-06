import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import type { SseEvent } from "@ail/shared";
import type { SseWriter } from "../../plugins/sse.js";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-structured-repair.db");
process.env.LLM_PROVIDER = "mock";

const { closeDb } = await import("../../db/index.js");
const { runRepairLoop } = await import("./repair.js");

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

describe("runRepairLoop (integration, mock provider)", () => {
  afterAll(() => closeDb());

  it("converges to valid JSON within maxAttempts and stops making further attempts", async () => {
    const { writer, events } = fakeWriter();
    // The schema only requires a "topic" string - MockProvider's jsonMode
    // canned output already includes a "topic" field, so this should
    // converge on the FIRST repair attempt.
    const schema = { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] };

    await runRepairLoop({
      invalidJson: "{not valid json",
      schema,
      providerId: "mock",
      model: "mock-small",
      maxAttempts: 3,
      writer,
    });

    const attemptEvents = events.filter((e) => e.type === "stage" && e.stage === "repair.attempt");
    expect(attemptEvents.length).toBeGreaterThan(0);
    expect(attemptEvents.length).toBeLessThanOrEqual(3);

    const lastAttempt = attemptEvents[attemptEvents.length - 1];
    if (lastAttempt?.type === "stage") {
      expect((lastAttempt.data as { valid: boolean }).valid).toBe(true);
    }
  });

  it("each repair attempt is persisted as its own Run, chained via parentRunId", async () => {
    const { writer, events } = fakeWriter();
    // A schema requiring a field the mock's canned jsonMode output can NEVER
    // produce ("nonexistent_field") guarantees every attempt is invalid, so
    // with maxAttempts: 2 the loop deterministically runs exactly 2 full
    // attempts every time - the chaining assertion below always executes
    // instead of sitting in an `if (runCompletes.length > 1)` branch that
    // the other test in this file (which converges on attempt 1) never takes.
    const schema = {
      type: "object",
      properties: { nonexistent_field: { type: "string" } },
      required: ["nonexistent_field"],
    };

    await runRepairLoop({
      invalidJson: "{not valid json",
      schema,
      providerId: "mock",
      model: "mock-small",
      maxAttempts: 2,
      writer,
    });

    const runCompletes = events.filter((e) => e.type === "run_complete");
    expect(runCompletes).toHaveLength(2);
    const [first, second] = runCompletes;
    if (first?.type !== "run_complete" || second?.type !== "run_complete") {
      throw new Error("expected both repair attempts to emit run_complete events");
    }
    expect(second.run.parentRunId).toBe(first.run.id);
    expect(first.run.parentRunId).toBeUndefined();
  });

  it("stops without any repair call when the input is already valid", async () => {
    const { writer, events } = fakeWriter();
    const schema = { type: "object", properties: { ok: { type: "boolean" } } };

    await runRepairLoop({
      invalidJson: '{"ok":true}',
      schema,
      providerId: "mock",
      model: "mock-small",
      writer,
    });

    expect(events.some((e) => e.type === "run_start")).toBe(false);
    const attemptEvents = events.filter((e) => e.type === "stage" && e.stage === "repair.attempt");
    expect(attemptEvents).toHaveLength(1);
  });
});
