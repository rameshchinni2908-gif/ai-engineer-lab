/**
 * Deterministic, approximate tokenizer shared by every provider's
 * `countTokens()` and by M1's token visualizer (`llm-modules` calls
 * `approxTokenize`/`countApproxTokens` rather than reimplementing this).
 *
 * This is NOT a real BPE/tiktoken tokenizer - real provider SDKs are not a
 * dependency of this app (CLAUDE.md: no vendor SDK deps). It approximates
 * subword tokenization well enough for teaching purposes:
 *   1. Split on whitespace and punctuation boundaries (words stay together).
 *   2. Split any run longer than ~4 characters into 4-character sub-chunks,
 *      which mimics BPE's tendency to split longer/rarer words into pieces.
 * The approximation is documented as such wherever it is surfaced in the UI
 * (per contracts.md §4 M1 `/fundamentals/tokenize`).
 */

export interface ApproxToken {
  id: number;
  text: string;
}

const WORD_OR_PUNCT = /\w+|[^\s\w]+|\s+/g;
const SUBCHUNK_SIZE = 4;

/** Pure function: deterministically splits `text` into approximate tokens. */
export function approxTokenize(text: string): ApproxToken[] {
  const tokens: ApproxToken[] = [];
  let id = 0;
  const matches = text.match(WORD_OR_PUNCT) ?? [];
  for (const match of matches) {
    if (/^\s+$/.test(match)) {
      // Whitespace collapses into the token that follows it in real
      // tokenizers (e.g. GPT's "Ġword"); here we keep it as its own token
      // when it's the full match (e.g. leading/trailing whitespace), but
      // for interior whitespace it is harmless to emit as a single token.
      tokens.push({ id: id++, text: match });
      continue;
    }
    if (match.length <= SUBCHUNK_SIZE) {
      tokens.push({ id: id++, text: match });
      continue;
    }
    for (let i = 0; i < match.length; i += SUBCHUNK_SIZE) {
      tokens.push({ id: id++, text: match.slice(i, i + SUBCHUNK_SIZE) });
    }
  }
  return tokens;
}

/** Pure function: approximate token count for `text`. */
export function countApproxTokens(text: string): number {
  return approxTokenize(text).length;
}
