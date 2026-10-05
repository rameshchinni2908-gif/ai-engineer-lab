import type { Message } from "@ail/shared";
import { apiFetch } from "@/lib/api";

export interface TokenizeToken {
  id: number;
  text: string;
  bytes: number[];
}

export interface TokenizeResponse {
  tokens: TokenizeToken[];
  tokenCount: number;
}

/** `POST /api/fundamentals/tokenize` - module-local fetcher per docs/component-api.md §13. */
export function tokenize(text: string, model: string): Promise<TokenizeResponse> {
  return apiFetch<TokenizeResponse>("/fundamentals/tokenize", { method: "POST", body: { text, model } });
}

export type ContextStrategy = "truncate-oldest" | "truncate-middle" | "sliding-window" | "summarize";

export interface ContextWindowResponse {
  fits: boolean;
  usedTokens: number;
  contextWindow: number;
  truncatedMessages: Message[];
  strategyApplied: string;
  droppedCount: number;
}

/** `POST /api/fundamentals/context-window` */
export function computeContextWindow(body: {
  messages: Message[];
  model: string;
  strategy: ContextStrategy;
}): Promise<ContextWindowResponse> {
  return apiFetch<ContextWindowResponse>("/fundamentals/context-window", { method: "POST", body });
}
