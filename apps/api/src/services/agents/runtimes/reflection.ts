import type { AgentEngine } from "../engine.js";
import { argsForTool } from "./tool-args.js";

/**
 * Act -> critique -> revise -> final. The critique step explicitly
 * consults long-term memory (`engine.memory.retrieveLongTerm`) before the
 * revision, so the memory inspector has a real "what was retrieved and
 * why" entry for this runtime, not just writes.
 */
export async function runReflection(engine: AgentEngine, goal: string, toolAllowList: string[]): Promise<void> {
  engine.checkLimits();
  await engine.narrate("thought", `Goal: ${goal}\nAttempt an initial answer.`);

  let latest = engine.steps[engine.steps.length - 1]?.content ?? "";
  const [firstTool, secondTool] = toolAllowList;

  if (firstTool) {
    const { resultStep } = await engine.toolCall(firstTool, argsForTool(firstTool, goal));
    latest = resultStep.content;
  }

  await engine.narrate("reflection", `Critique this attempt and note what, if anything, should change: ${latest}`);
  engine.memory.retrieveLongTerm(engine.steps.length, goal, 3);

  if (secondTool) {
    const { resultStep } = await engine.toolCall(secondTool, argsForTool(secondTool, goal));
    latest = resultStep.content;
  }

  await engine.final(`Revised answer after reflection: ${latest || "no revision was needed."}`);
}
