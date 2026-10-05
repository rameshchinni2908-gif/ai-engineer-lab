import type { AgentEngine } from "../engine.js";
import { argsForTool } from "./tool-args.js";

/**
 * Supervisor delegates each allow-listed tool to a "worker" (one
 * `delegate` step per handoff, followed by that worker's own `tool_call`/
 * `tool_result`), then synthesizes all worker outputs into a final answer.
 */
export async function runSupervisorWorker(engine: AgentEngine, goal: string, toolAllowList: string[]): Promise<void> {
  engine.checkLimits();
  await engine.narrate("thought", `Goal: ${goal}\nAs supervisor, decide how to split this work across workers.`);

  const results: string[] = [];
  for (const name of toolAllowList) {
    await engine.delegate(`Delegating to a worker responsible for the "${name}" tool.`);
    const { resultStep } = await engine.toolCall(name, argsForTool(name, goal));
    results.push(resultStep.content);
  }

  await engine.final(`Supervisor synthesized worker results: ${results.join(" | ") || "no workers were delegated to."}`);
}
