import type { Message, ProviderId } from "@ail/shared";
import { estimateCostUsd, findModel } from "@ail/shared";
import { countApproxTokens } from "../../services/runs/tokenizer.js";
import { runGenerationOnce } from "../../services/runs/generation.js";

export type ContextTrimStrategy = "truncate-oldest" | "truncate-middle" | "sliding-window" | "summarize";

export interface ContextTrimSimRequest {
  messages: Message[];
  providerId: ProviderId;
  model: string;
  strategy: ContextTrimStrategy;
}

export interface ContextTrimSimResult {
  untrimmed: { inputTokens: number; costUsd: number };
  trimmed: { inputTokens: number; costUsd: number; strategyApplied: string };
  /** Token-based (not cost-based): meaningful even for a $0/MTok local or
   * mock model, where a cost-based figure would always be 0 regardless of
   * how many tokens were actually cut. */
  savingsPct: number;
}

function messageText(msg: Message): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .map((b) => (b.type === "text" ? b.text : b.type === "tool_result" ? b.content : ""))
    .join(" ");
}

function tokensOf(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + countApproxTokens(messageText(m)), 0);
}

/**
 * Demo trim target: cut to at most half of the model's documented context
 * window. This is this demo's own stated policy (not a universal "correct"
 * number) - the point is to show a concrete, measurable before/after token
 * reduction for whichever strategy is chosen; a real system would size this
 * from its own prompt budget instead.
 */
const TRIM_TARGET_RATIO = 0.5;

/** Pure: truncate-oldest, drop oldest messages until under budget. */
export function truncateOldest(messages: Message[], targetTokens: number): Message[] {
  const kept: Message[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = countApproxTokens(messageText(messages[i]!));
    if (total + t > targetTokens && kept.length > 0) break;
    kept.unshift(messages[i]!);
    total += t;
  }
  return kept;
}

/** Pure: truncate-middle, keep the first and last messages, drop from the middle. */
export function truncateMiddle(messages: Message[], targetTokens: number): Message[] {
  if (messages.length <= 2) return messages;
  const first = messages[0]!;
  const last = messages[messages.length - 1]!;
  let total = countApproxTokens(messageText(first)) + countApproxTokens(messageText(last));
  const middleKept: Message[] = [];

  // Fill from the end of the middle section backward (keep the most recent
  // middle context first), stopping once the budget is exhausted.
  for (let i = messages.length - 2; i >= 1; i--) {
    const t = countApproxTokens(messageText(messages[i]!));
    if (total + t > targetTokens) break;
    middleKept.unshift(messages[i]!);
    total += t;
  }
  return [first, ...middleKept, last];
}

/** Pure: sliding-window, keep only the most recent messages that fit. */
export function slidingWindow(messages: Message[], targetTokens: number): Message[] {
  return truncateOldest(messages, targetTokens);
}

/** Replaces all but the last message with one LLM-generated summary. Makes a real call (its own persisted `Run`). */
async function summarizeDropped(
  dropped: Message[],
  providerId: ProviderId,
  model: string,
): Promise<Message> {
  const transcript = dropped
    .map((m) => `${m.role}: ${messageText(m)}`)
    .join("\n");
  const run = await runGenerationOnce({
    moduleId: "production",
    feature: "context-trim-sim-summarize",
    providerId,
    model,
    messages: [
      {
        role: "user",
        content: `Summarize the following conversation history concisely, preserving facts needed to continue it:\n\n${transcript}`,
      },
    ],
  });
  return { role: "system", content: `Summary of earlier conversation: ${run.output.text}` };
}

/**
 * `POST /production/context-trim-sim`. 4th CLAUDE.md cost lever. No module
 * export of M1's `/fundamentals/context-window` trimming service exists yet
 * to reuse (checked: `apps/api/src/services/fundamentals/` only has
 * `tokenize.ts` as of this writing) - this implements the same four
 * strategies locally rather than reimplementing a DIFFERENT algorithm, so
 * behavior stays consistent with that route's documented strategies.
 */
export async function runContextTrimSim(req: ContextTrimSimRequest): Promise<ContextTrimSimResult> {
  const info = findModel(req.model);
  const contextWindow = info?.contextWindow ?? 16_000;
  const targetTokens = Math.floor(contextWindow * TRIM_TARGET_RATIO);

  const untrimmedTokens = tokensOf(req.messages);

  let trimmedMessages: Message[];
  if (req.strategy === "truncate-oldest") {
    trimmedMessages = truncateOldest(req.messages, targetTokens);
  } else if (req.strategy === "truncate-middle") {
    trimmedMessages = truncateMiddle(req.messages, targetTokens);
  } else if (req.strategy === "sliding-window") {
    trimmedMessages = slidingWindow(req.messages, targetTokens);
  } else {
    // summarize: keep the last message verbatim, summarize everything before it.
    if (req.messages.length <= 1) {
      trimmedMessages = req.messages;
    } else {
      const last = req.messages[req.messages.length - 1]!;
      const dropped = req.messages.slice(0, -1);
      const summary = await summarizeDropped(dropped, req.providerId, req.model);
      trimmedMessages = [summary, last];
    }
  }

  const trimmedTokens = tokensOf(trimmedMessages);
  const untrimmedCost = estimateCostUsd({ inputTokens: untrimmedTokens, outputTokens: 0 }, info ?? { inputCostPerMTok: 0, outputCostPerMTok: 0 });
  const trimmedCost = estimateCostUsd({ inputTokens: trimmedTokens, outputTokens: 0 }, info ?? { inputCostPerMTok: 0, outputCostPerMTok: 0 });

  const savingsPct =
    untrimmedTokens > 0 ? ((untrimmedTokens - trimmedTokens) / untrimmedTokens) * 100 : 0;

  return {
    untrimmed: { inputTokens: untrimmedTokens, costUsd: untrimmedCost.totalCostUsd },
    trimmed: { inputTokens: trimmedTokens, costUsd: trimmedCost.totalCostUsd, strategyApplied: req.strategy },
    savingsPct,
  };
}
