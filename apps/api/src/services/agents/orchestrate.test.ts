import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import type { AgentLimits, SseEvent } from "@ail/shared";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-agents-orchestrate.db");

const { closeDb } = await import("../../db/index.js");
const { runAgent } = await import("./orchestrate.js");
const { getAgentMemory } = await import("./memory/index.js");
const { resolveApproval } = await import("./approval.js");

afterAll(() => closeDb());

function limits(overrides: Partial<AgentLimits> = {}): AgentLimits {
  return {
    maxSteps: 20,
    budgetUsd: 1000,
    timeoutMs: 15_000,
    loopDetection: { enabled: true, window: 3, similarityThreshold: 0.95 },
    requireApprovalForDangerousTools: false,
    ...overrides,
  };
}

function collectingWriter(): { events: SseEvent[]; writer: { send: (e: SseEvent) => void; ping: () => void; close: () => void } } {
  const events: SseEvent[] = [];
  return { events, writer: { send: (e) => events.push(e), ping: () => undefined, close: () => undefined } };
}

function stepsOf(events: SseEvent[]) {
  return events.filter((e): e is Extract<SseEvent, { type: "agent_step" }> => e.type === "agent_step").map((e) => e.step);
}

describe("runAgent - react runtime", () => {
  it("reaches a final answer, emits real per-step usage/cost/duration, and records a run_complete wrapper Run", async () => {
    const { events, writer } = collectingWriter();
    const result = await runAgent(
      {
        runtime: "react",
        goal: "What is 2 + 2?",
        toolAllowList: ["calculator"],
        providerId: "mock",
        model: "mock-small",
        limits: limits(),
      },
      writer,
    );

    expect(result.stopReason).toBe("final");
    expect(result.status).toBe("complete");
    const steps = stepsOf(events);
    expect(steps.some((s) => s.type === "thought")).toBe(true);
    expect(steps.some((s) => s.type === "tool_call")).toBe(true);
    expect(steps.some((s) => s.type === "tool_result")).toBe(true);
    expect(steps.some((s) => s.type === "final")).toBe(true);
    // thought steps are real nested LLM calls - real usage/cost/duration, not placeholders.
    const thought = steps.find((s) => s.type === "thought")!;
    expect(thought.usage).toBeDefined();
    expect(thought.durationMs).toBeGreaterThanOrEqual(0);

    const complete = events.find((e): e is Extract<SseEvent, { type: "run_complete" }> => e.type === "run_complete");
    expect(complete).toBeDefined();
    expect(complete!.run.moduleId).toBe("agents");
    expect(complete!.run.output.parsedJson).toMatchObject({ id: result.id, stopReason: "final" });
  }, 20_000);

  it("stops with stopReason 'max_steps' when the step budget is exhausted before a final answer", async () => {
    const { writer } = collectingWriter();
    const result = await runAgent(
      {
        runtime: "react",
        goal: "Research something that needs multiple tools",
        toolAllowList: ["calculator", "web_search", "vector_search"],
        providerId: "mock",
        model: "mock-small",
        limits: limits({ maxSteps: 1 }),
      },
      writer,
    );
    expect(result.stopReason).toBe("max_steps");
    // One thought step (the only step that fit under maxSteps) plus the
    // orchestrator's own explicit "why we stopped" error step.
    expect(result.steps.length).toBeLessThanOrEqual(2);
    expect(result.steps.some((s) => s.type === "error" && s.content.includes("maxSteps"))).toBe(true);
  }, 20_000);

  it("stops with stopReason 'budget' once projected cost would exceed budgetUsd (model priced via the real catalog, executed through the zero-key MockProvider)", async () => {
    const { writer } = collectingWriter();
    // providerId stays "mock" (no network, no keys, fully deterministic) but
    // `model` names a real priced catalog entry so `estimateCost` produces a
    // genuine nonzero cost per step - exercising the real budget-check path
    // rather than mock-mode's normally-free pricing.
    const result = await runAgent(
      {
        runtime: "react",
        goal: "What is 2 + 2?",
        toolAllowList: ["calculator"],
        providerId: "mock",
        model: "claude-sonnet-5",
        limits: limits({ budgetUsd: 0.0000001 }),
      },
      writer,
    );
    expect(result.stopReason).toBe("budget");
  }, 20_000);

  it("stops with stopReason 'timeout' when the overall run exceeds timeoutMs", async () => {
    const { writer } = collectingWriter();
    const result = await runAgent(
      {
        runtime: "react",
        goal: "What is 2 + 2?",
        toolAllowList: ["calculator"],
        providerId: "mock",
        model: "mock-small",
        limits: limits({ timeoutMs: 0 }),
      },
      writer,
    );
    expect(result.stopReason).toBe("timeout");
  }, 20_000);

  it("stops with stopReason 'loop_detected' when a failing tool call keeps getting retried identically", async () => {
    const { writer } = collectingWriter();
    const result = await runAgent(
      {
        runtime: "react",
        // Deterministically extracts the expression "5 / 0" every time (see
        // argsForTool), which the calculator tool always rejects - a
        // realistic "agent keeps retrying the thing that just failed" stuck
        // pattern for loop detection to catch.
        goal: "Compute 5 / 0 as many times as it takes to get an answer",
        toolAllowList: ["calculator"],
        providerId: "mock",
        model: "mock-small",
        limits: limits({ maxSteps: 50, loopDetection: { enabled: true, window: 3, similarityThreshold: 0.9 } }),
      },
      writer,
    );
    expect(result.stopReason).toBe("loop_detected");
    expect(result.steps.length).toBeLessThan(50);
  }, 20_000);

  it("records writes/retrievals in short-term, long-term, and summary memory, inspectable per run", async () => {
    const { writer } = collectingWriter();
    const result = await runAgent(
      {
        runtime: "react",
        goal: "What is 3 + 3?",
        toolAllowList: ["calculator"],
        providerId: "mock",
        model: "mock-small",
        limits: limits(),
      },
      writer,
    );
    const memory = getAgentMemory(result.id);
    expect(memory).toBeDefined();
    const snapshot = memory!.snapshot();
    expect(snapshot.shortTerm.length).toBeGreaterThan(0);
    expect(snapshot.longTerm.length).toBeGreaterThan(0);
    expect(snapshot.summary.length).toBeGreaterThan(0);
  }, 20_000);
});

describe("runAgent - human-in-the-loop approval", () => {
  it("pauses at approval_request, resumes on approve, and completes normally", async () => {
    const { events, writer } = collectingWriter();
    const runPromise = runAgent(
      {
        runtime: "react",
        goal: "Run some code",
        toolAllowList: ["code_sandbox"],
        providerId: "mock",
        model: "mock-small",
        limits: limits({ requireApprovalForDangerousTools: true }),
      },
      writer,
    );

    let agentRunId: string | undefined;
    let approvalStepIndex: number | undefined;
    for (let i = 0; i < 100 && approvalStepIndex === undefined; i++) {
      await new Promise((r) => setTimeout(r, 10));
      const start = events.find((e): e is Extract<SseEvent, { type: "run_start" }> => e.type === "run_start");
      agentRunId = start?.runId;
      const approvalStep = stepsOf(events).find((s) => s.type === "approval_request");
      approvalStepIndex = approvalStep?.index;
    }
    expect(agentRunId).toBeDefined();
    expect(approvalStepIndex).toBeDefined();

    const resolved = resolveApproval(agentRunId!, approvalStepIndex!, true);
    expect(resolved).toBe(true);

    const result = await runPromise;
    expect(result.stopReason).toBe("final");
    expect(result.steps.some((s) => s.type === "approval_request")).toBe(true);
  }, 20_000);

  it("denies the tool call when approved:false - the tool never executes, and react retries the same (now re-gated) action", async () => {
    const { events, writer } = collectingWriter();
    // A denied dangerous call is retried by `react` (isError counts as a
    // failed attempt) which re-triggers approval - deliberately NOT
    // auto-resolved here, so a short timeoutMs keeps this test fast while
    // still proving the FIRST denial genuinely blocked execution.
    const runPromise = runAgent(
      {
        runtime: "react",
        goal: "Run some code",
        toolAllowList: ["code_sandbox"],
        providerId: "mock",
        model: "mock-small",
        limits: limits({ requireApprovalForDangerousTools: true, timeoutMs: 300 }),
      },
      writer,
    );

    let agentRunId: string | undefined;
    let approvalStepIndex: number | undefined;
    for (let i = 0; i < 100 && approvalStepIndex === undefined; i++) {
      await new Promise((r) => setTimeout(r, 10));
      const start = events.find((e): e is Extract<SseEvent, { type: "run_start" }> => e.type === "run_start");
      agentRunId = start?.runId;
      approvalStepIndex = stepsOf(events).find((s) => s.type === "approval_request")?.index;
    }
    resolveApproval(agentRunId!, approvalStepIndex!, false, "looked unsafe");

    const result = await runPromise;
    const resultSteps = result.steps.filter((s) => s.type === "tool_result");
    expect(resultSteps.some((s) => s.content.includes("denied by reviewer"))).toBe(true);
    // The tool itself (which would echo "=> 4" from console.log output) never ran.
    expect(resultSteps.some((s) => s.content.includes("=>"))).toBe(false);
  }, 20_000);

  it("times out an unresolved approval and stops with stopReason 'timeout', with a visible error step", async () => {
    const { writer } = collectingWriter();
    const result = await runAgent(
      {
        runtime: "react",
        goal: "Run some code",
        toolAllowList: ["code_sandbox"],
        providerId: "mock",
        model: "mock-small",
        limits: limits({ requireApprovalForDangerousTools: true, timeoutMs: 50 }),
      },
      writer,
    );
    expect(result.stopReason).toBe("timeout");
    expect(result.steps.some((s) => s.type === "error")).toBe(true);
  }, 20_000);
});

describe("runAgent - other runtimes", () => {
  it("plan_execute: emits a plan step, then executes, then finalizes", async () => {
    const { writer } = collectingWriter();
    const result = await runAgent(
      {
        runtime: "plan_execute",
        goal: "What is 5 + 5?",
        toolAllowList: ["calculator"],
        providerId: "mock",
        model: "mock-small",
        limits: limits(),
      },
      writer,
    );
    expect(result.stopReason).toBe("final");
    expect(result.steps.some((s) => s.type === "plan")).toBe(true);
  }, 20_000);

  it("reflection: emits an act -> reflect -> revise -> final sequence and consults long-term memory", async () => {
    const { writer } = collectingWriter();
    const result = await runAgent(
      {
        runtime: "reflection",
        goal: "Summarize loop detection",
        toolAllowList: ["web_search"],
        providerId: "mock",
        model: "mock-small",
        limits: limits(),
      },
      writer,
    );
    expect(result.stopReason).toBe("final");
    expect(result.steps.some((s) => s.type === "reflection")).toBe(true);
    const memory = getAgentMemory(result.id)!;
    expect(memory.snapshot().retrievals.length).toBeGreaterThan(0);
  }, 20_000);

  it("supervisor_worker: emits a delegate step per worker and synthesizes a final answer", async () => {
    const { writer } = collectingWriter();
    const result = await runAgent(
      {
        runtime: "supervisor_worker",
        goal: "Gather facts about agents",
        toolAllowList: ["web_search", "calculator"],
        providerId: "mock",
        model: "mock-small",
        limits: limits(),
      },
      writer,
    );
    expect(result.stopReason).toBe("final");
    const delegateSteps = result.steps.filter((s) => s.type === "delegate");
    expect(delegateSteps.length).toBe(2);
  }, 20_000);
});
