/**
 * Small, dependency-free word-level diff built on the classic LCS
 * (longest common subsequence) algorithm. Used by `<CompareView>` to render
 * a real text diff between two run outputs/prompts - never a generic
 * "these differ" message per CLAUDE.md's "tied to the actual run" rule.
 *
 * Intentionally pure + unit-testable (CLAUDE.md: "pure functions ... easy
 * to unit test").
 */

export type DiffOp = "add" | "remove" | "same";

export interface DiffToken {
  op: DiffOp;
  text: string;
}

/** Split on whitespace but keep the whitespace as its own token so rendering preserves spacing. */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

/**
 * Word-level diff of `a` -> `b` using LCS. Returns a flat sequence of
 * `{ op, text }` tokens: `"same"` tokens appear in both, `"remove"` tokens
 * were only in `a`, `"add"` tokens were only in `b`.
 */
export function diffWords(a: string, b: string): DiffToken[] {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  const n = aTokens.length;
  const m = bTokens.length;

  // dp[i][j] = length of LCS of aTokens[i..] and bTokens[j..]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        aTokens[i] === bTokens[j]
          ? (dp[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(dp[i + 1]?.[j] ?? 0, dp[i]?.[j + 1] ?? 0);
    }
  }

  const result: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aTokens[i] === bTokens[j]) {
      result.push({ op: "same", text: aTokens[i]! });
      i++;
      j++;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      result.push({ op: "remove", text: aTokens[i]! });
      i++;
    } else {
      result.push({ op: "add", text: bTokens[j]! });
      j++;
    }
  }
  while (i < n) {
    result.push({ op: "remove", text: aTokens[i]! });
    i++;
  }
  while (j < m) {
    result.push({ op: "add", text: bTokens[j]! });
    j++;
  }

  return mergeAdjacent(result);
}

/** Merge consecutive tokens with the same op into one, so rendering produces fewer DOM nodes. */
function mergeAdjacent(tokens: DiffToken[]): DiffToken[] {
  const merged: DiffToken[] = [];
  for (const token of tokens) {
    const last = merged[merged.length - 1];
    if (last && last.op === token.op) {
      last.text += token.text;
    } else {
      merged.push({ ...token });
    }
  }
  return merged;
}

/** Generic field-level diff for two flat records (used for params/usage/metric deltas in CompareView). */
export interface FieldDiff {
  field: string;
  aValue: unknown;
  bValue: unknown;
  changed: boolean;
}

export function diffFields(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): FieldDiff[] {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  return keys.map((field) => {
    const aValue = a[field];
    const bValue = b[field];
    return {
      field,
      aValue,
      bValue,
      changed: JSON.stringify(aValue) !== JSON.stringify(bValue),
    };
  });
}
