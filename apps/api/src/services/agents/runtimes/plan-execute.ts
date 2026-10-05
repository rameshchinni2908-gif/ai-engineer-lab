import type { AgentEngine } from "../engine.js";
import { StopSignal } from "../engine.js";
import { argsForTool } from "./tool-args.js";

/**
 * Plan-and-execute: produce the whole plan upfront (one `plan` step naming
 * every tool it intends to use, in order), then execute each planned step
 * without re-planning between them, then a final synthesis. Unlike
 * `react`, a failed step is NOT retried - it surfaces as an explicit
 * `error` step and the run stops, since "replan from scratch" is out of
 * scope for this runtime by design (that's closer to `reflection`).
 */
export async function runPlanExecute(engine: AgentEngine, goal: string, toolAllowList: string[]): Promise<void> {
  engine.checkLimits();
  const planDescription =
    toolAllowList.length > 0
      ? `Use these tools in order: ${toolAllowList.join(", ")}. Then summarize.`
      : "Answer directly from reasoning alone - no tools are available for this run.";
  await engine.narrate("plan", `Goal: ${goal}\nProduce a short upfront plan.\nPlan: ${planDescription}`);

  for (const name of toolAllowList) {
    const { resultStep } = await engine.toolCall(name, argsForTool(name, goal));
    if (resultStep.toolResult?.isError) {
      await engine.error(`Plan step "${name}" failed and plan_execute does not replan: ${resultStep.content}`);
      throw new StopSignal("error");
    }
  }

  const results = engine.steps
    .filter((s) => s.type === "tool_result")
    .map((s) => s.content)
    .join(" | ");
  await engine.final(`Plan executed successfully. Results: ${results || "no tool steps were planned."}`);
}
