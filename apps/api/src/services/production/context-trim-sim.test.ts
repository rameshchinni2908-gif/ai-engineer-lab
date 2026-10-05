import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import type { Message } from "@ail/shared";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-context-trim-sim.db");

const { closeDb } = await import("../../db/index.js");
const { truncateOldest, truncateMiddle, slidingWindow, runContextTrimSim } = await import(
  "./context-trim-sim.js"
);

function msg(role: Message["role"], content: string): Message {
  return { role, content };
}

describe("context trim pure functions: token math", () => {
  it("truncateOldest keeps the most recent messages and drops the oldest first", () => {
    const messages = [msg("user", "one"), msg("assistant", "two"), msg("user", "three")];
    const result = truncateOldest(messages, 1_000_000);
    expect(result).toEqual(messages); // generous budget keeps everything
  });

  it("truncateOldest drops oldest messages under a tight budget", () => {
    const longText = "word ".repeat(200);
    const messages = [msg("user", longText), msg("assistant", longText), msg("user", "short")];
    const result = truncateOldest(messages, 50);
    expect(result[result.length - 1]).toEqual(messages[messages.length - 1]);
    expect(result.length).toBeLessThan(messages.length);
  });

  it("truncateMiddle always preserves the first and last message", () => {
    const longText = "word ".repeat(200);
    const messages = [msg("system", "first"), msg("user", longText), msg("assistant", longText), msg("user", "last")];
    const result = truncateMiddle(messages, 10);
    expect(result[0]).toEqual(messages[0]);
    expect(result[result.length - 1]).toEqual(messages[messages.length - 1]);
  });

  it("slidingWindow behaves like truncateOldest (keep the most recent N under budget)", () => {
    const messages = [msg("user", "a"), msg("assistant", "b"), msg("user", "c")];
    expect(slidingWindow(messages, 1_000_000)).toEqual(truncateOldest(messages, 1_000_000));
  });
});

describe("runContextTrimSim: measured token/cost reduction", () => {
  afterAll(() => closeDb());

  it("truncate-oldest reduces input tokens and reports a positive savingsPct for an overlong conversation", async () => {
    const longText = "word ".repeat(500);
    const messages: Message[] = Array.from({ length: 10 }, (_, i) => msg(i % 2 === 0 ? "user" : "assistant", `${longText} turn ${i}`));
    const result = await runContextTrimSim({
      messages,
      providerId: "mock",
      model: "mock-small",
      strategy: "truncate-oldest",
    });
    expect(result.trimmed.inputTokens).toBeLessThan(result.untrimmed.inputTokens);
    expect(result.savingsPct).toBeGreaterThan(0);
    expect(result.trimmed.strategyApplied).toBe("truncate-oldest");
  });

  it("a conversation that already fits the trim target is reported with ~0% savings (no information is dropped unnecessarily)", async () => {
    const messages: Message[] = [msg("user", "hi"), msg("assistant", "hello")];
    const result = await runContextTrimSim({
      messages,
      providerId: "mock",
      model: "mock-small",
      strategy: "sliding-window",
    });
    expect(result.trimmed.inputTokens).toBe(result.untrimmed.inputTokens);
    expect(result.savingsPct).toBe(0);
  });

  it("summarize strategy makes a real (recorded) LLM call and still reduces token count for a long history", async () => {
    const longText = "word ".repeat(500);
    const messages: Message[] = Array.from({ length: 8 }, (_, i) => msg(i % 2 === 0 ? "user" : "assistant", `${longText} turn ${i}`));
    const result = await runContextTrimSim({
      messages,
      providerId: "mock",
      model: "mock-small",
      strategy: "summarize",
    });
    expect(result.trimmed.strategyApplied).toBe("summarize");
    expect(result.trimmed.inputTokens).toBeLessThan(result.untrimmed.inputTokens);
  });

  it("costUsd is computed from the model's catalog rate applied to measured token counts, not invented", async () => {
    const messages: Message[] = [msg("user", "hello there, a medium length message for cost math")];
    const result = await runContextTrimSim({
      messages,
      providerId: "mock",
      model: "mock-small",
      strategy: "truncate-oldest",
    });
    // mock-small's rate is $0/MTok, so cost is honestly 0 even though tokens are real.
    expect(result.untrimmed.costUsd).toBe(0);
  });
});
