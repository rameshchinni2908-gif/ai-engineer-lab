import type { AgentRun, ProviderId, Run } from "@ail/shared";
import { insertRun } from "../runs/index.js";

/**
 * Builds the SSE `run_complete` payload's synthetic wrapper `Run` for one
 * finished agent execution - the same pattern `/evals/run` already uses
 * per contracts §4 (`run_complete.run` is a synthetic wrapper whose
 * `output.parsedJson` holds the full domain result, which is ALSO fetchable
 * via its own dedicated endpoint - here, `GET /agents/:id`). This keeps
 * `POST /agents/run`'s SSE stream contract-compliant (every `run_complete`
 * carries a full `Run`) without forcing `AgentRun` itself to be reshaped
 * into `RunSchema`.
 */
export async function buildWrapperRun(
  agentRun: AgentRun,
  context: { providerId: ProviderId; model: string },
  finalText: string,
): Promise<Run> {
  return insertRun({
    moduleId: "agents",
    feature: `agents.${agentRun.runtime}`,
    providerId: context.providerId,
    model: context.model,
    params: {},
    input: { messages: [{ role: "user", content: agentRun.goal }] },
    output: {
      text: finalText,
      parsedJson: agentRun,
      finishReason: agentRun.status === "error" ? "error" : "stop",
    },
    usage: agentRun.totals.usage,
    cost: agentRun.totals.cost,
    latencyMs: agentRun.totals.durationMs,
    status: agentRun.status === "error" ? "error" : "complete",
    error: agentRun.status === "error" ? finalText : undefined,
    traceId: agentRun.traceId,
    tags: ["agent", agentRun.runtime, agentRun.stopReason ?? "unknown"],
    metadata: { agentRunId: agentRun.id, stopReason: agentRun.stopReason ?? null },
    completedAt: new Date().toISOString(),
  });
}
