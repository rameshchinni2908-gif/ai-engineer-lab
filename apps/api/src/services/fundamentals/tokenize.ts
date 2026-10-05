/**
 * M1 tokenizer visualizer service. Wraps backend-core's shared
 * `approxTokenize`/`countApproxTokens` (docs/backend-api.md says reuse it,
 * not reimplement) and adds the byte-level view the route-local response
 * shape wants (contracts.md §4 M1 `/fundamentals/tokenize`).
 */
import { approxTokenize } from "../runs/tokenizer.js";

export interface VisualToken {
  id: number;
  text: string;
  bytes: number[];
}

export interface TokenizeResult {
  tokens: VisualToken[];
  tokenCount: number;
}

/** Pure: tokenizes `text` and attaches the UTF-8 byte sequence for each token (teaches "tokens aren't characters"). */
export function tokenizeForVisualizer(text: string): TokenizeResult {
  const tokens = approxTokenize(text).map((t) => ({
    id: t.id,
    text: t.text,
    bytes: Array.from(Buffer.from(t.text, "utf8")),
  }));
  return { tokens, tokenCount: tokens.length };
}

/** Pure: chars-per-token ratio, guarding against the empty-text / zero-token edge case. */
export function charsPerToken(text: string, tokenCount: number): number {
  if (tokenCount === 0) return 0;
  return text.length / tokenCount;
}
