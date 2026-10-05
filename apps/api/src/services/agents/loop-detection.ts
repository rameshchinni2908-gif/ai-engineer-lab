import type { AgentStep, LoopDetectionConfig } from "@ail/shared";
import { textSimilarity } from "./embedding.js";

function toolCallSignature(step: AgentStep): string | undefined {
  if (step.type !== "tool_call" || !step.toolCall) return undefined;
  return `${step.toolCall.name}::${JSON.stringify(step.toolCall.arguments)}`;
}

/**
 * Pure, unit-testable loop detector: takes the recent `window` tool_call
 * steps (ignoring thought/plan/reflection narration, which legitimately
 * varies even when the underlying action doesn't) and flags a loop when
 * their average pairwise similarity is at or above `similarityThreshold` -
 * i.e. the agent is calling the same tool with the same (or near-identical)
 * arguments repeatedly without the action itself changing.
 */
export function detectLoop(steps: readonly AgentStep[], cfg: LoopDetectionConfig): boolean {
  if (!cfg.enabled) return false;
  const signatures = steps.map(toolCallSignature).filter((s): s is string => s !== undefined);
  if (signatures.length < cfg.window) return false;

  const windowSigs = signatures.slice(-cfg.window);
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < windowSigs.length; i++) {
    for (let j = i + 1; j < windowSigs.length; j++) {
      total += textSimilarity(windowSigs[i]!, windowSigs[j]!);
      pairs++;
    }
  }
  const avg = pairs > 0 ? total / pairs : 0;
  return avg >= cfg.similarityThreshold;
}
