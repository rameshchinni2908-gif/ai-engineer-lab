import { randomUUID } from "node:crypto";
import type {
  AgentLimits,
  AgentRuntime,
  AgentStep,
  AgentStopReason,
  CostBreakdown,
  GenerationParams,
  ProviderId,
  TokenUsage,
  ToolCall,
} from "@ail/shared";
import { runGenerationOnce } from "../runs/index.js";
import type { SseWriter } from "../../plugins/sse.js";
import { insertAgentStep, updateAgentRun } from "./store.js";
import { createAgentMemory, type AgentMemory } from "./memory/index.js";
import { detectLoop } from "./loop-detection.js";
import { registerPendingApproval, type ApprovalOutcome } from "./approval.js";
import { isDangerousTool } from "./tools/registry.js";
import { dispatchTool } from "./tool-dispatch.js";

function zeroUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}
function zeroCost(): CostBreakdown {
  return { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, currency: "USD" };
}

/** Thrown by the engine to unwind a runtime's loop the moment a hard control (max steps/budget/timeout/loop detection) trips. Caught once, at the top of `orchestrate.ts`. */
export class StopSignal extends Error {
  constructor(public readonly stopReason: AgentStopReason) {
    super(`agent stop: ${stopReason}`);
  }
}

export interface RuntimeArgs {
  agentRunId: string;
  runtime: AgentRuntime;
  goal: string;
  toolAllowList: string[];
  providerId: ProviderId;
  model: string;
  params?: GenerationParams;
  limits: AgentLimits;
  traceId: string;
}

/**
 * Owns step numbering, DB persistence, SSE emission, running totals, and
 * every one of the five controls from CLAUDE.md. Runtime implementations
 * (`runtimes/*.ts`) only decide WHAT to do next by calling these methods -
 * they never touch the SSE writer, the DB, or a limit check directly.
 */
export class AgentEngine {
  readonly memory: AgentMemory;
  #steps: AgentStep[] = [];
  #totals = { usage: zeroUsage(), cost: zeroCost(), durationMs: 0 };
  #startedAt = Date.now();

  constructor(
    private readonly args: RuntimeArgs,
    private readonly writer: SseWriter,
  ) {
    this.memory = createAgentMemory(args.agentRunId);
  }

  get steps(): readonly AgentStep[] {
    return this.#steps;
  }

  get totals(): { usage: TokenUsage; cost: CostBreakdown; durationMs: number } {
    return this.#totals;
  }

  /** Throws `StopSignal` if `maxSteps`/`timeoutMs` is already exceeded. Call before starting any more work. */
  checkLimits(): void {
    if (this.#steps.length >= this.args.limits.maxSteps) throw new StopSignal("max_steps");
    if (Date.now() - this.#startedAt > this.args.limits.timeoutMs) throw new StopSignal("timeout");
  }

  #checkBudget(addedCostUsd: number): void {
    if (this.#totals.cost.totalCostUsd + addedCostUsd > this.args.limits.budgetUsd) {
      throw new StopSignal("budget");
    }
  }

  /** One nested LLM call (records its own `Run`, visible via `GET /runs?traceId=`) narrated as a thought/plan/reflection step - never offers tools, so the model always returns plain text. */
  async narrate(stepType: "thought" | "plan" | "reflection", prompt: string): Promise<AgentStep> {
    this.checkLimits();
    const startedAt = new Date().toISOString();
    const run = await runGenerationOnce({
      moduleId: "agents",
      feature: `agents.${this.args.runtime}.${stepType}`,
      providerId: this.args.providerId,
      model: this.args.model,
      messages: [{ role: "user", content: prompt }],
      params: { ...this.args.params, toolChoice: "none" },
      traceId: this.args.traceId,
      tags: ["agent", this.args.runtime],
    });
    this.#checkBudget(run.cost.totalCostUsd);
    const step: AgentStep = {
      index: this.#steps.length,
      type: stepType,
      content: run.output.text,
      usage: run.usage,
      cost: run.cost,
      durationMs: run.latencyMs,
      startedAt,
    };
    await this.#record(step);
    return step;
  }

  /** A supervisor's delegation narration (`supervisor_worker`) - no LLM call, zero cost. */
  async delegate(content: string): Promise<AgentStep> {
    this.checkLimits();
    const step: AgentStep = {
      index: this.#steps.length,
      type: "delegate",
      content,
      durationMs: 0,
      startedAt: new Date().toISOString(),
    };
    await this.#record(step);
    return step;
  }

  /** Executes one tool call end to end: `tool_call` -> (approval gate if required) -> `tool_result`. Enforces the allow-list structurally - this is the real security boundary, not a prompt instruction. */
  async toolCall(name: string, args: unknown): Promise<{ callStep: AgentStep; resultStep: AgentStep }> {
    this.checkLimits();
    if (!this.args.toolAllowList.includes(name)) {
      throw new Error(`Tool "${name}" is not in this run's toolAllowList.`);
    }

    const toolCall: ToolCall = { id: `call_${randomUUID()}`, name, arguments: args };
    const callStep: AgentStep = {
      index: this.#steps.length,
      type: "tool_call",
      content: `Calling ${name}(${JSON.stringify(args)})`,
      toolCall,
      durationMs: 0,
      startedAt: new Date().toISOString(),
    };
    await this.#record(callStep);

    const requiresApproval =
      this.args.limits.requireApprovalForDangerousTools &&
      (isDangerousTool(name) || (this.args.limits.approvalRequiredTools ?? []).includes(name));

    if (requiresApproval) {
      const outcome = await this.#awaitApproval(toolCall);
      if (!outcome.approved) {
        const deniedStep: AgentStep = {
          index: this.#steps.length,
          type: "tool_result",
          content: `Tool call denied by reviewer${outcome.note ? `: ${outcome.note}` : ""}.`,
          toolResult: { toolCallId: toolCall.id, content: "denied by reviewer", isError: true, durationMs: 0 },
          durationMs: 0,
          startedAt: new Date().toISOString(),
        };
        await this.#record(deniedStep);
        return { callStep, resultStep: deniedStep };
      }
    }

    const result = await dispatchTool(toolCall.id, name, args);
    const resultStep: AgentStep = {
      index: this.#steps.length,
      type: "tool_result",
      content: result.content,
      toolResult: result,
      durationMs: result.durationMs,
      startedAt: new Date().toISOString(),
    };
    await this.#record(resultStep);
    return { callStep, resultStep };
  }

  async #awaitApproval(toolCall: ToolCall): Promise<ApprovalOutcome> {
    const approvalStep: AgentStep = {
      index: this.#steps.length,
      type: "approval_request",
      content: `Approval required before calling "${toolCall.name}" with arguments ${JSON.stringify(toolCall.arguments)}.`,
      toolCall,
      durationMs: 0,
      startedAt: new Date().toISOString(),
    };
    await this.#record(approvalStep);
    await updateAgentRun(this.args.agentRunId, { status: "awaiting_approval" });

    const { promise, cancel } = registerPendingApproval(this.args.agentRunId, approvalStep.index);
    const timeoutMs = this.args.limits.timeoutMs;
    const timeoutPromise = new Promise<ApprovalOutcome>((resolve) =>
      setTimeout(() => resolve({ approved: false, timedOut: true }), timeoutMs),
    );

    const outcome = await Promise.race([promise, timeoutPromise]);
    cancel();
    await updateAgentRun(this.args.agentRunId, { status: "running" });

    if (outcome.timedOut) throw new StopSignal("timeout");
    return outcome;
  }

  async final(content: string): Promise<AgentStep> {
    const step: AgentStep = {
      index: this.#steps.length,
      type: "final",
      content,
      durationMs: 0,
      startedAt: new Date().toISOString(),
    };
    await this.#record(step);
    return step;
  }

  async error(content: string): Promise<AgentStep> {
    const step: AgentStep = {
      index: this.#steps.length,
      type: "error",
      content,
      durationMs: 0,
      startedAt: new Date().toISOString(),
    };
    await this.#record(step);
    return step;
  }

  async #record(step: AgentStep): Promise<void> {
    step.memoryWrites = this.memory.recordStep(step);
    this.#steps.push(step);
    await insertAgentStep(this.args.agentRunId, step);

    if (step.usage) {
      this.#totals.usage = {
        inputTokens: this.#totals.usage.inputTokens + step.usage.inputTokens,
        outputTokens: this.#totals.usage.outputTokens + step.usage.outputTokens,
        totalTokens: this.#totals.usage.totalTokens + step.usage.totalTokens,
      };
    }
    if (step.cost) {
      this.#totals.cost = {
        inputCostUsd: this.#totals.cost.inputCostUsd + step.cost.inputCostUsd,
        outputCostUsd: this.#totals.cost.outputCostUsd + step.cost.outputCostUsd,
        totalCostUsd: this.#totals.cost.totalCostUsd + step.cost.totalCostUsd,
        currency: "USD",
      };
    }
    this.#totals.durationMs = Date.now() - this.#startedAt;

    this.writer.send({ type: "agent_step", runId: this.args.agentRunId, step });

    if (detectLoop(this.#steps, this.args.limits.loopDetection)) {
      throw new StopSignal("loop_detected");
    }
  }
}
