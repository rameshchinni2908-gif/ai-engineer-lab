/**
 * `llm_judge`: pure prompt-building and response-parsing halves of the
 * LLM-as-judge metric. The actual provider call (and `Run`/`judgeRunId`
 * bookkeeping) lives in `runner.ts`, which calls these pure functions - kept
 * separate so the prompt/parse logic is unit-testable without a provider.
 */
import { wordOverlapRatio, wordSet } from "./vectorMath.js";

export const DEFAULT_JUDGE_RUBRIC =
  "Score the response from 0 to 10 on how correct, complete, and helpful it is " +
  "given the input and (if provided) the expected/reference answer. " +
  "Respond with ONLY a JSON object: {\"score\": <0-10 number>, \"rationale\": \"<one sentence>\"}.";

export interface JudgePromptArgs {
  rubric: string;
  input: string;
  output: string;
  expected?: string;
}

/** Builds the judge prompt. Editable rubric is interpolated verbatim - this is the entire point of "editable rubric". */
export function buildJudgePrompt(args: JudgePromptArgs): string {
  const expectedBlock = args.expected ? `\n\nReference/expected answer:\n${args.expected}` : "";
  return [
    `Rubric:\n${args.rubric}`,
    `Input given to the model under evaluation:\n${args.input}`,
    `Response to evaluate:\n${args.output}${expectedBlock}`,
  ].join("\n\n");
}

export interface JudgeVerdict {
  score: number; // normalized to 0..1
  rationale: string;
}

/** Parses a judge model's free-text response into a normalized 0..1 score. Tolerant of surrounding prose around the JSON object, and of a bare number as a fallback. */
export function parseJudgeResponse(text: string): JudgeVerdict {
  const jsonMatch = text.match(/\{[^{}]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { score?: unknown; rationale?: unknown };
      if (typeof parsed.score === "number") {
        return {
          score: clamp01(parsed.score / 10),
          rationale: typeof parsed.rationale === "string" ? parsed.rationale : "(no rationale given)",
        };
      }
    } catch {
      // fall through to the numeric-fallback below
    }
  }
  const numberMatch = text.match(/(\d+(\.\d+)?)\s*\/\s*10|(?:^|\s)(\d+(\.\d+)?)(?:\s|$)/);
  if (numberMatch) {
    const raw = Number(numberMatch[1] ?? numberMatch[3]);
    if (!Number.isNaN(raw)) {
      return { score: clamp01(raw / 10), rationale: "Parsed from a bare numeric score (non-JSON judge response)." };
    }
  }
  return { score: 0.5, rationale: "Could not parse a numeric score from the judge response; defaulted to 0.5." };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Deterministic lexical-overlap fallback judge, used when the generating
 * provider is `mock` (whose templated output has no real semantic relation
 * to the judge prompt, so parsing its text would just return a flat 0.5
 * every time - not "meaningful" per CLAUDE.md's mock-mode guarantee).
 * Clearly illustrative, same honesty convention this app uses elsewhere
 * (e.g. the attention-heatmap/quantization demos) for provider limitations.
 */
export function heuristicJudgeScore(output: string, expected?: string): JudgeVerdict {
  if (!expected) {
    return {
      score: 0.5,
      rationale: "Mock-judge heuristic: no reference/expected answer was supplied, so a neutral score was assigned.",
    };
  }
  const score = wordOverlapRatio(wordSet(expected), wordSet(output));
  return {
    score,
    rationale: `Mock-judge heuristic: ${(score * 100).toFixed(0)}% lexical overlap between the output and the expected/reference answer (not a real semantic judgment).`,
  };
}
