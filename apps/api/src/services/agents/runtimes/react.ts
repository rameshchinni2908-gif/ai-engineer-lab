import type { AgentEngine } from "../engine.js";
import { argsForTool } from "./tool-args.js";

interface PlannedAction {
  name: string;
  args: unknown;
}

/**
 * Classic ReAct loop: thought -> tool_call -> tool_result -> repeat ->
 * final. Tools are taken from `toolAllowList` in order; if a tool call
 * errors, the SAME action is retried on the next iteration (a realistic
 * "agent keeps trying the thing that just failed" stuck pattern) - which is
 * exactly what loop detection exists to catch before `maxSteps` does.
 */
export async function runReact(engine: AgentEngine, goal: string, toolAllowList: string[]): Promise<void> {
  const queue = [...toolAllowList];
  let retry: PlannedAction | undefined;

  for (;;) {
    engine.checkLimits();

    const recent = engine.steps
      .slice(-3)
      .map((s) => `[${s.type}] ${s.content}`)
      .join(" | ");
    const prompt =
      engine.steps.length === 0
        ? `Goal: ${goal}\nDecide your first action.`
        : `Goal: ${goal}\nRecent steps: ${recent}\nDecide your next action.`;
    await engine.narrate("thought", prompt);

    const action: PlannedAction | undefined = retry ?? (queue.length > 0 ? { name: queue.shift()!, args: undefined } : undefined);
    if (!action) {
      const findings = engine.steps
        .filter((s) => s.type === "tool_result")
        .map((s) => s.content)
        .join(" | ");
      await engine.final(`Goal addressed. Findings: ${findings || "no tools were needed for this goal."}`);
      return;
    }
    const args = action.args ?? argsForTool(action.name, goal);

    const { resultStep } = await engine.toolCall(action.name, args);
    retry = resultStep.toolResult?.isError ? { name: action.name, args } : undefined;
  }
}
