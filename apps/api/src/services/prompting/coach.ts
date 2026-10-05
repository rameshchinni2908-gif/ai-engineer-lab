/**
 * M2 bad -> better prompt coach (`POST /prompting/coach` - contracts.md §4
 * M2). Heuristic scoring is a pure function (unit-tested without any
 * provider); the actual rewrite is one real, costed LLM call via
 * `runGenerationOnce` (so it's a persisted `Run`, referenced from the
 * response via `metadata.runId`, per contracts.md's "not hidden inside a
 * free coaching feature" requirement).
 */
import type { ProviderId } from "@ail/shared";
import { runGenerationOnce } from "../runs/index.js";
import { diffWords, type DiffToken } from "./word-diff.js";

export interface CoachIssue {
  label: string;
  detail: string;
}

/** Pure: heuristic issue-detection + 0-100 score for a raw prompt string. */
export function scorePrompt(prompt: string): { score: number; issues: CoachIssue[] } {
  const issues: CoachIssue[] = [];
  const trimmed = prompt.trim();

  if (trimmed.length < 20) {
    issues.push({
      label: "Too short / underspecified",
      detail: "The prompt is very short and likely under-specifies the task, format, and constraints.",
    });
  }
  if (!/\b(format|json|list|table|markdown|bullet|xml)\b/i.test(trimmed)) {
    issues.push({
      label: "No output format specified",
      detail: "The prompt doesn't say what shape the response should take, which invites inconsistent output.",
    });
  }
  if (!/\bexample|e\.g\.|for instance\b/i.test(trimmed) && trimmed.length < 300) {
    issues.push({
      label: "No examples provided",
      detail: "A short, example-free prompt for a non-trivial task often benefits from at least one worked example.",
    });
  }
  if (/\b(good|nice|better|great|interesting|some|things?)\b/i.test(trimmed) && trimmed.split(/\s+/).length < 40) {
    issues.push({
      label: "Vague qualifiers",
      detail: "Words like 'good'/'nice'/'things' leave the actual success criteria unstated.",
    });
  }
  if (!/[.!?]$/.test(trimmed)) {
    issues.push({
      label: "No clear instruction boundary",
      detail: "The prompt doesn't end with clear punctuation/structure, which can blur where the instruction ends.",
    });
  }
  if (!/\byou are\b/i.test(trimmed) && !/\brole\b/i.test(trimmed)) {
    issues.push({
      label: "No role/persona framing",
      detail: "Giving the model an explicit role (e.g. 'You are a senior X') often sharpens tone and domain focus.",
    });
  }

  const score = Math.max(0, 100 - issues.length * 15);
  return { score, issues };
}

export interface CoachResult {
  score: number;
  issues: CoachIssue[];
  improvedPrompt: string;
  diff: DiffToken[];
  runId: string;
}

export interface RunCoachArgs {
  prompt: string;
  providerId?: ProviderId;
  model?: string;
}

/** `POST /prompting/coach`: heuristic scoring + one real LLM call to produce `improvedPrompt`. */
export async function runCoach(args: RunCoachArgs): Promise<CoachResult> {
  const { score, issues } = scorePrompt(args.prompt);
  const providerId = args.providerId ?? "mock";
  const model = args.model ?? "mock-small";

  const issuesSummary = issues.map((i) => `- ${i.label}: ${i.detail}`).join("\n") || "- No major issues detected.";
  const run = await runGenerationOnce({
    moduleId: "prompting",
    feature: "coach.improve",
    providerId,
    model,
    system:
      "You are a prompt-engineering coach. Rewrite the user's prompt to fix the listed issues while preserving its original intent. Respond with ONLY the rewritten prompt, no commentary.",
    messages: [
      {
        role: "user",
        content: `Original prompt:\n"""${args.prompt}"""\n\nIssues found:\n${issuesSummary}\n\nRewrite the prompt.`,
      },
    ],
    tags: ["coach"],
  });

  const improvedPrompt = run.output.text.trim() || args.prompt;
  const diff = diffWords(args.prompt, improvedPrompt);

  return { score, issues, improvedPrompt, diff, runId: run.id };
}
