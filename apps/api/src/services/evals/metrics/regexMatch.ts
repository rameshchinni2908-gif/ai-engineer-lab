/** `regex`: score is 1 if `output` matches the pattern (expected, as a string regex source), else 0. */
export function regexMatch(output: string, expected: unknown): { score: number; rationale: string } {
  const pattern = typeof expected === "string" ? expected : String(expected ?? "");
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch (err) {
    return {
      score: 0,
      rationale: `Invalid regex pattern "${pattern}": ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const matched = re.test(output);
  return {
    score: matched ? 1 : 0,
    rationale: matched
      ? `Output matched pattern /${pattern}/.`
      : `Output did not match pattern /${pattern}/.`,
  };
}
