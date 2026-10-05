/** `exact_match`: score is 1 if the (trimmed) output equals the (trimmed, stringified) expected value, else 0. */
export function exactMatch(output: string, expected: unknown): { score: number; rationale: string } {
  const expectedText = typeof expected === "string" ? expected : JSON.stringify(expected ?? "");
  const match = output.trim() === expectedText.trim();
  return {
    score: match ? 1 : 0,
    rationale: match
      ? "Output matched the expected value exactly (after trimming)."
      : `Output did not match. Expected "${expectedText.trim()}", got "${output.trim()}".`,
  };
}
