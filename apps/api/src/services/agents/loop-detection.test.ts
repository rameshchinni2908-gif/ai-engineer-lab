import { describe, expect, it } from "vitest";
import type { AgentStep, LoopDetectionConfig } from "@ail/shared";
import { detectLoop } from "./loop-detection.js";

function toolCallStep(index: number, name: string, args: unknown): AgentStep {
  return {
    index,
    type: "tool_call",
    content: `Calling ${name}`,
    toolCall: { id: `call_${index}`, name, arguments: args },
    durationMs: 1,
    startedAt: new Date().toISOString(),
  };
}

function thoughtStep(index: number, content: string): AgentStep {
  return { index, type: "thought", content, durationMs: 1, startedAt: new Date().toISOString() };
}

const cfg = (overrides: Partial<LoopDetectionConfig> = {}): LoopDetectionConfig => ({
  enabled: true,
  window: 3,
  similarityThreshold: 0.9,
  ...overrides,
});

describe("detectLoop", () => {
  it("returns false when disabled, regardless of repetition", () => {
    const steps = [
      toolCallStep(0, "calculator", { expression: "bad" }),
      toolCallStep(1, "calculator", { expression: "bad" }),
      toolCallStep(2, "calculator", { expression: "bad" }),
    ];
    expect(detectLoop(steps, cfg({ enabled: false }))).toBe(false);
  });

  it("returns false until there are at least `window` tool_call steps", () => {
    const steps = [toolCallStep(0, "calculator", { expression: "bad" }), toolCallStep(1, "calculator", { expression: "bad" })];
    expect(detectLoop(steps, cfg({ window: 3 }))).toBe(false);
  });

  it("flags a run that repeats the exact same tool call across the window", () => {
    const steps = [
      thoughtStep(0, "trying calculator"),
      toolCallStep(1, "calculator", { expression: "banana" }),
      thoughtStep(2, "retrying"),
      toolCallStep(3, "calculator", { expression: "banana" }),
      thoughtStep(4, "retrying again"),
      toolCallStep(5, "calculator", { expression: "banana" }),
    ];
    expect(detectLoop(steps, cfg({ window: 3, similarityThreshold: 0.95 }))).toBe(true);
  });

  it("does NOT flag genuinely different, progressing tool calls", () => {
    const steps = [
      toolCallStep(0, "web_search", { query: "ReAct agents" }),
      toolCallStep(1, "calculator", { expression: "2 + 2" }),
      toolCallStep(2, "vector_search", { query: "loop detection" }),
    ];
    expect(detectLoop(steps, cfg({ window: 3, similarityThreshold: 0.9 }))).toBe(false);
  });

  it("only looks at tool_call steps, ignoring thought/plan narration content", () => {
    const steps = [
      thoughtStep(0, "I will now try something completely different each time"),
      thoughtStep(1, "I will now try something completely different each time"),
      thoughtStep(2, "I will now try something completely different each time"),
      toolCallStep(3, "web_search", { query: "a" }),
      toolCallStep(4, "calculator", { expression: "1 + 1" }),
      toolCallStep(5, "vector_search", { query: "z" }),
    ];
    // Thoughts are identical but tool_calls are not - must not flag.
    expect(detectLoop(steps, cfg({ window: 3, similarityThreshold: 0.9 }))).toBe(false);
  });
});
