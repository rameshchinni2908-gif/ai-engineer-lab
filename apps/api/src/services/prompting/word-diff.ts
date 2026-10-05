/**
 * Small, dependency-free word-level LCS diff for `POST /prompting/coach`'s
 * bad->better comparison. Deliberately a standalone implementation (not an
 * import from `apps/web/src/lib/diff.ts`, which is a different package /
 * runtime and owned by `frontend-shell`) - same algorithm shape, independent
 * code, pure + unit-testable.
 */
export type DiffOp = "add" | "remove" | "same";
export interface DiffToken {
  op: DiffOp;
  text: string;
}

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

/** Pure: word-level diff of `a` -> `b` via LCS. */
export function diffWords(a: string, b: string): DiffToken[] {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  const n = aTokens.length;
  const m = bTokens.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        aTokens[i] === bTokens[j] ? (dp[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(dp[i + 1]?.[j] ?? 0, dp[i]?.[j + 1] ?? 0);
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
