import { describe, expect, it } from "vitest";
import type { Message } from "@ail/shared";
import {
  messageTokens,
  totalTokens,
  truncateOldest,
  truncateMiddle,
  slidingWindow,
  computeContextWindow,
} from "./context-window.js";

function userMsg(text: string): Message {
  return { role: "user", content: text };
}
function sysMsg(text: string): Message {
  return { role: "system", content: text };
}

// A long-ish filler string so each message reliably costs multiple tokens.
const FILLER = "the quick brown fox jumps over the lazy dog repeatedly and again";

describe("truncateOldest", () => {
  it("keeps all messages when they already fit the budget", () => {
    const messages = [userMsg("hi"), userMsg("there")];
    const budget = totalTokens(messages) + 10;
    const { messages: kept, droppedMessages } = truncateOldest(messages, budget);
    expect(kept).toEqual(messages);
    expect(droppedMessages).toHaveLength(0);
  });

  it("drops the OLDEST non-system messages first", () => {
    const m1 = userMsg(FILLER);
    const m2 = userMsg(FILLER);
    const m3 = userMsg("short");
    const messages = [m1, m2, m3];
    // Budget only large enough for the last message plus a little slack.
    const budget = messageTokens(m3) + 3;
    const { messages: kept, droppedMessages } = truncateOldest(messages, budget);
    expect(kept).toEqual([m3]);
    expect(droppedMessages).toEqual([m1, m2]);
  });

  it("never drops a system message even under a very tight budget", () => {
    const sys = sysMsg("you are a helpful assistant");
    const messages = [sys, userMsg(FILLER), userMsg(FILLER)];
    const { messages: kept, droppedMessages } = truncateOldest(messages, 1);
    expect(kept).toContainEqual(sys);
    expect(droppedMessages).not.toContainEqual(sys);
  });
});

describe("truncateMiddle", () => {
  it("keeps all messages when they already fit the budget", () => {
    const messages = [userMsg("hi"), userMsg("there")];
    const { messages: kept, droppedMessages } = truncateMiddle(messages, totalTokens(messages) + 10);
    expect(kept).toEqual(messages);
    expect(droppedMessages).toHaveLength(0);
  });

  it("keeps the head and tail, dropping messages from the middle", () => {
    const head = userMsg("first message, head of the conversation");
    const middle1 = userMsg(FILLER);
    const middle2 = userMsg(FILLER);
    const tail = userMsg("most recent message, tail of the conversation");
    const messages = [head, middle1, middle2, tail];
    const budget = messageTokens(head) + messageTokens(tail) + 2;
    const { messages: kept, droppedMessages } = truncateMiddle(messages, budget);
    expect(kept[0]).toEqual(head);
    expect(kept[kept.length - 1]).toEqual(tail);
    expect(droppedMessages).toContainEqual(middle1);
    expect(droppedMessages).toContainEqual(middle2);
  });

  it("pins the system message outside the head/tail budget accounting", () => {
    const sys = sysMsg("system rules");
    const messages = [sys, userMsg(FILLER), userMsg("tail")];
    const { messages: kept } = truncateMiddle(messages, messageTokens(sys) + messageTokens(userMsg("tail")) + 2);
    expect(kept[0]).toEqual(sys);
  });
});

describe("slidingWindow", () => {
  it("keeps only the MOST RECENT messages that fit the budget", () => {
    const m1 = userMsg(FILLER);
    const m2 = userMsg(FILLER);
    const m3 = userMsg("most recent");
    const messages = [m1, m2, m3];
    const budget = messageTokens(m3) + 3;
    const { messages: kept, droppedMessages } = slidingWindow(messages, budget);
    expect(kept).toEqual([m3]);
    expect(droppedMessages).toEqual([m1, m2]);
  });

  it("always keeps the pinned system message budget-independent of the window", () => {
    const sys = sysMsg("rules");
    const messages = [sys, userMsg(FILLER), userMsg("recent")];
    const { messages: kept } = slidingWindow(messages, 1);
    expect(kept[0]).toEqual(sys);
  });
});

describe("computeContextWindow", () => {
  const CONTEXT_WINDOW = 1000;
  const OUTPUT_RESERVE = 100;

  it("reports fits=true and applies no strategy when under budget", async () => {
    const messages = [userMsg("short message")];
    const result = await computeContextWindow({
      messages,
      contextWindow: CONTEXT_WINDOW,
      outputReserve: OUTPUT_RESERVE,
      strategy: "truncate-oldest",
    });
    expect(result.fits).toBe(true);
    expect(result.droppedCount).toBe(0);
    expect(result.strategyApplied).toBe("none");
    expect(result.truncatedMessages).toEqual(messages);
  });

  it("applies truncate-oldest and reports the correct droppedCount when over budget", async () => {
    const messages = Array.from({ length: 50 }, () => userMsg(FILLER));
    const result = await computeContextWindow({
      messages,
      contextWindow: 200,
      outputReserve: 50,
      strategy: "truncate-oldest",
    });
    expect(result.fits).toBe(false);
    expect(result.strategyApplied).toBe("truncate-oldest");
    expect(result.droppedCount).toBeGreaterThan(0);
    expect(result.truncatedMessages.length).toBeLessThan(messages.length);
  });

  it("applies summarize by replacing dropped messages with one synthetic summary message", async () => {
    const messages = Array.from({ length: 50 }, () => userMsg(FILLER));
    const result = await computeContextWindow({
      messages,
      contextWindow: 200,
      outputReserve: 50,
      strategy: "summarize",
      summarize: async (dropped) => `summary of ${dropped.length} messages`,
    });
    expect(result.strategyApplied).toBe("summarize");
    expect(result.droppedCount).toBeGreaterThan(0);
    const summaryMsg = result.truncatedMessages.find(
      (m) => typeof m.content === "string" && m.content.includes("Summary of"),
    );
    expect(summaryMsg).toBeDefined();
  });

  it("rejects an unknown strategy's budget math gracefully for truncate-middle", async () => {
    const head = userMsg("head");
    const middle = Array.from({ length: 20 }, () => userMsg(FILLER));
    const tail = userMsg("tail");
    const result = await computeContextWindow({
      messages: [head, ...middle, tail],
      contextWindow: 200,
      outputReserve: 50,
      strategy: "truncate-middle",
    });
    expect(result.strategyApplied).toBe("truncate-middle");
    expect(result.truncatedMessages[0]).toEqual(head);
    expect(result.truncatedMessages[result.truncatedMessages.length - 1]).toEqual(tail);
  });
});
