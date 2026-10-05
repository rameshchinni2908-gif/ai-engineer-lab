import { randomUUID } from "node:crypto";
import type { AgentLimits, AgentRun, AgentRuntime, AgentStopReason, GenerationParams, ProviderId } from "@ail/shared";
import type { SseWriter } from "../../plugins/sse.js";
import { AgentEngine, StopSignal } from "./engine.js";
import { insertAgentRun, updateAgentRun, getAgentRun } from "./store.js";
import { buildWrapperRun } from "./wrapper-run.js";
import { runReact } from "./runtimes/react.js";
import { runPlanExecute } from "./runtimes/plan-execute.js";
import { runReflection } from "./runtimes/reflection.js";
import { runSupervisorWorker } from "./runtimes/supervisor-worker.js";

export interface RunAgentRequest {
  runtime: AgentRuntime;
  goal: string;
  toolAllowList: string[];
  providerId: ProviderId;
  model: string;
  limits: AgentLimits;
  params?: GenerationParams;
}

function zeroTotals(): AgentRun["totals"] {
  return {
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, currency: "USD" },
    durationMs: 0,
  };
}

function describeStop(reason: AgentStopReason): string {
  switch (reason) {
    case "max_steps":
      return "Stopped: reached the configured maxSteps limit before producing a final answer.";
    case "budget":
      return "Stopped: the next step would have exceeded the configured budgetUsd cap.";
    case "timeout":
      return "Stopped: exceeded the configured timeoutMs (including an unresolved approval wait).";
    case "loop_detected":
      return "Stopped: loop detection found near-identical repeated tool calls within the configured window.";
    default:
      return `Stopped: ${reason}.`;
  }
}

/**
 * Top-level agent orchestrator: persists the `AgentRun` row, dispatches to
 * the chosen runtime, and uniformly handles every termination path
 * (`StopSignal` from a tripped control, a runtime's own thrown error, or a
 * clean `final`), emitting the terminal `agent_step` + synthetic
 * `run_complete` wrapper `Run` the SSE route then forwards `done` after.
 */
export async function runAgent(req: RunAgentRequest, writer: SseWriter): Promise<AgentRun> {
  const agentRunId = `agent_${randomUUID()}`;
  const traceId = `trace_${randomUUID()}`;
  const createdAt = new Date().toISOString();

  await insertAgentRun({
    id: agentRunId,
    runtime: req.runtime,
    goal: req.goal,
    status: "running",
    limits: req.limits,
    totals: zeroTotals(),
    traceId,
    createdAt,
  });
  writer.send({ type: "run_start", runId: agentRunId });

  const engine = new AgentEngine(
    {
      agentRunId,
      runtime: req.runtime,
      goal: req.goal,
      toolAllowList: req.toolAllowList,
      providerId: req.providerId,
      model: req.model,
      params: req.params,
      limits: req.limits,
      traceId,
    },
    writer,
  );

  let stopReason: AgentStopReason;
  try {
    switch (req.runtime) {
      case "react":
        await runReact(engine, req.goal, req.toolAllowList);
        break;
      case "plan_execute":
        await runPlanExecute(engine, req.goal, req.toolAllowList);
        break;
      case "reflection":
        await runReflection(engine, req.goal, req.toolAllowList);
        break;
      case "supervisor_worker":
        await runSupervisorWorker(engine, req.goal, req.toolAllowList);
        break;
    }
    stopReason = "final";
  } catch (err) {
    if (err instanceof StopSignal) {
      stopReason = err.stopReason;
      if (stopReason !== "final") {
        await engine.error(describeStop(stopReason)).catch(() => undefined);
      }
    } else {
      stopReason = "error";
      const message = err instanceof Error ? err.message : String(err);
      await engine.error(`Unhandled error: ${message}`).catch(() => undefined);
    }
  }

  const status = stopReason === "error" ? "error" : "complete";
  await updateAgentRun(agentRunId, { status, stopReason, totals: engine.totals });

  const finished = await getAgentRun(agentRunId);
  if (!finished) throw new Error(`agent run ${agentRunId} vanished immediately after completion`);

  const lastStep = finished.steps[finished.steps.length - 1];
  const wrapperRun = await buildWrapperRun(
    finished,
    { providerId: req.providerId, model: req.model },
    lastStep?.content ?? "(no steps recorded)",
  );
  writer.send({ type: "run_complete", runId: agentRunId, run: wrapperRun });

  return finished;
}
