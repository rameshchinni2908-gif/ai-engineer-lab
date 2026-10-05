import { describe, expect, it } from "vitest";
import { scorePrompt } from "./coach.js";

describe("scorePrompt", () => {
  it("flags a short, vague, example-free, format-free prompt with multiple issues", () => {
    const { score, issues } = scorePrompt("make it good");
    expect(issues.length).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it("scores a well-specified prompt higher than a vague one", () => {
    const vague = scorePrompt("make it good");
    const good = scorePrompt(
      "You are a senior copy editor. Rewrite the following paragraph in formal English and return ONLY a JSON object like {\"result\": \"...\"}. For example, 'hi' becomes 'Hello'.",
    );
    expect(good.score).toBeGreaterThan(vague.score);
  });

  it("never returns a negative score even with many issues", () => {
    const { score } = scorePrompt("ok");
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("does not flag a prompt that already specifies format, role, and an example", () => {
    const strong = scorePrompt(
      "You are a senior data analyst. Return your answer as a markdown table. For example: | a | b |. Be precise and complete.",
    );
    expect(strong.issues.find((i) => i.label.includes("role"))).toBeUndefined();
    expect(strong.issues.find((i) => i.label.includes("format"))).toBeUndefined();
  });
});
