/**
 * M1 context-window meter + truncation strategies
 * (contracts.md §4 M1 `/fundamentals/context-window`).
 *
 * Every strategy is a pure function over `Message[]` + a token budget so
 * it's trivial to unit test exactly which messages get dropped. `summarize`
 * is the one exception that needs an LLM call (to compress the dropped
 * messages) - that side effect lives in `applyStrategy`, which is NOT pure,
 * while the strategies themselves (`truncateOldest`/`truncateMiddle`/
 * `slidingWindow`) stay pure and side-effect-free.
 */
import type { Message } from "@ail/shared";
import { countApproxTokens } from "../runs/tokenizer.js";

export type ContextStrategy = "truncate-oldest" | "truncate-middle" | "sliding-window" | "summarize";

export interface TruncationOutcome {
  messages: Message[];
  droppedMessages: Message[];
}

/** Pure: flattens a Message's content into plain text for tokenization. */
export function messageText(msg: Message): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "tool_result") return block.content;
      return "";
    })
    .join(" ");
}

/** Pure: approximate token count for one message (role + content). */
export function messageTokens(msg: Message): number {
  return countApproxTokens(messageText(msg)) + 2; // +2 fudge for role/wrapper overhead, mirrors chat-format overhead
}

/** Pure: total approximate token count across all messages. */
export function totalTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + messageTokens(m), 0);
}

/**
 * Drops the OLDEST non-system messages first until the remainder fits
 * `budget` tokens. System messages are always pinned (never dropped) since
 * they carry the model's operating instructions.
 */
export function truncateOldest(messages: Message[], budget: number): TruncationOutcome {
  const pinned = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");

  const dropped: Message[] = [];
  const survivors = [...rest];
  while (totalTokens([...pinned, ...survivors]) > budget && survivors.length > 0) {
    dropped.push(survivors.shift()!);
  }
  return { messages: [...pinned, ...survivors], droppedMessages: dropped };
}

/**
 * Keeps the first (head) and last (tail) messages, dropping from the
 * middle of the non-system conversation - useful when both the opening
 * instructions/context AND the most recent turns matter more than the
 * middle of a long conversation.
 */
export function truncateMiddle(messages: Message[], budget: number): TruncationOutcome {
  const pinned = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const restBudget = Math.max(budget - totalTokens(pinned), 0);

  if (totalTokens(rest) <= restBudget || rest.length === 0) {
    return { messages, droppedMessages: [] };
  }

  const n = rest.length;
  const keep: boolean[] = new Array(n).fill(false);
  let lo = 0;
  let hi = n - 1;
  let used = 0;
  let takeFromHead = true;

  // Alternately grow from the head and the tail (outside-in), dropping
  // whatever remains in the middle once the budget is exhausted - keeps
  // both "the opening instructions" and "the most recent turns".
  while (lo <= hi) {
    const idx = takeFromHead ? lo : hi;
    const cost = messageTokens(rest[idx]!);
    if (used + cost > restBudget) break;
    keep[idx] = true;
    used += cost;
    if (takeFromHead) lo++;
    else hi--;
    takeFromHead = !takeFromHead;
  }

  const survivors = rest.filter((_, i) => keep[i]);
  const dropped = rest.filter((_, i) => !keep[i]);
  return { messages: [...pinned, ...survivors], droppedMessages: dropped };
}

/**
 * Keeps only the MOST RECENT messages that fit the budget (a fixed-size
 * window sliding forward in time) - simpler than truncate-oldest in that it
 * doesn't try to keep any early context at all beyond the pinned system message.
 */
export function slidingWindow(messages: Message[], budget: number): TruncationOutcome {
  const pinned = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");

  const survivors: Message[] = [];
  let used = totalTokens(pinned);
  for (let i = rest.length - 1; i >= 0; i--) {
    const cost = messageTokens(rest[i]!);
    if (used + cost > budget) break;
    survivors.unshift(rest[i]!);
    used += cost;
  }
  const survivorSet = new Set(survivors);
  const dropped = rest.filter((m) => !survivorSet.has(m));
  return { messages: [...pinned, ...survivors], droppedMessages: dropped };
}

export interface ContextWindowResult {
  fits: boolean;
  usedTokens: number;
  contextWindow: number;
  truncatedMessages: Message[];
  strategyApplied: string;
  droppedCount: number;
}

export interface ComputeContextWindowArgs {
  messages: Message[];
  contextWindow: number;
  /** Tokens reserved for the model's own output, subtracted from `contextWindow` to get the input budget. */
  outputReserve: number;
  strategy: ContextStrategy;
  /** Only needed for strategy "summarize" - produces a short summary of the dropped messages. */
  summarize?: (droppedMessages: Message[]) => Promise<string>;
}

/**
 * `POST /fundamentals/context-window`'s core logic. Computes whether the
 * conversation fits the model's context window and, if not, applies the
 * requested strategy and reports exactly which messages were dropped.
 */
export async function computeContextWindow(args: ComputeContextWindowArgs): Promise<ContextWindowResult> {
  const { messages, contextWindow, outputReserve, strategy } = args;
  const budget = Math.max(contextWindow - outputReserve, 0);
  const usedTokens = totalTokens(messages);

  if (usedTokens <= budget) {
    return {
      fits: true,
      usedTokens,
      contextWindow,
      truncatedMessages: messages,
      strategyApplied: "none",
      droppedCount: 0,
    };
  }

  if (strategy === "summarize") {
    // Reserve a little headroom for the synthetic summary message itself,
    // then figure out what truncate-oldest would drop under that smaller
    // budget, and replace it with one compact summary message instead.
    const summaryReserve = 60;
    const { messages: survivors, droppedMessages } = truncateOldest(messages, budget - summaryReserve);
    if (droppedMessages.length === 0) {
      return {
        fits: false,
        usedTokens,
        contextWindow,
        truncatedMessages: survivors,
        strategyApplied: "summarize",
        droppedCount: 0,
      };
    }
    const summaryText = args.summarize
      ? await args.summarize(droppedMessages)
      : `[${droppedMessages.length} earlier message(s) omitted]`;
    const summaryMessage: Message = {
      role: "system",
      content: `Summary of ${droppedMessages.length} earlier message(s): ${summaryText}`,
    };
    const pinnedSystem = survivors.filter((m) => m.role === "system");
    const rest = survivors.filter((m) => m.role !== "system");
    return {
      fits: false,
      usedTokens,
      contextWindow,
      truncatedMessages: [...pinnedSystem, summaryMessage, ...rest],
      strategyApplied: "summarize",
      droppedCount: droppedMessages.length,
    };
  }

  const outcome =
    strategy === "truncate-middle"
      ? truncateMiddle(messages, budget)
      : strategy === "sliding-window"
        ? slidingWindow(messages, budget)
        : truncateOldest(messages, budget);

  return {
    fits: false,
    usedTokens,
    contextWindow,
    truncatedMessages: outcome.messages,
    strategyApplied: strategy,
    droppedCount: outcome.droppedMessages.length,
  };
}
