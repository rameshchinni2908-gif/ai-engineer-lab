import { describe, expect, it } from "vitest";
import { exactMatch } from "./exactMatch.js";
import { regexMatch } from "./regexMatch.js";
import { jsonSchemaValidMetric, validateJsonSchema } from "./jsonSchemaValid.js";
import { semanticSimilarity } from "./semanticSimilarity.js";
import { cosineSimilarity } from "./vectorMath.js";
import { buildJudgePrompt, parseJudgeResponse, heuristicJudgeScore, DEFAULT_JUDGE_RUBRIC } from "./llmJudge.js";
import {
  buildPairwisePrompt,
  parsePairwiseResponse,
  pairwiseScore,
  verdictsAgreeAfterSwap,
  heuristicPairwiseVerdict,
} from "./pairwise.js";
import { ragAnswerRelevance, ragContextPrecision, ragContextRecall, ragFaithfulness, toContextArray } from "./rag.js";
import { costMetric, latencyMetric } from "./latencyCost.js";

describe("exact_match", () => {
  it("scores 1 for an exact (trimmed) match", () => {
    expect(exactMatch("  Paris  ", "Paris").score).toBe(1);
  });
  it("scores 0 for a mismatch", () => {
    expect(exactMatch("London", "Paris").score).toBe(0);
  });
});

describe("regex", () => {
  it("scores 1 when the output matches the pattern", () => {
    expect(regexMatch("order #12345 confirmed", "#\\d{5}").score).toBe(1);
  });
  it("scores 0 when it doesn't match", () => {
    expect(regexMatch("no order here", "#\\d{5}").score).toBe(0);
  });
  it("fails safe (score 0) on an invalid pattern instead of throwing", () => {
    expect(regexMatch("x", "(unterminated").score).toBe(0);
  });
});

describe("json_schema_valid", () => {
  const schema = {
    type: "object",
    required: ["name", "age"],
    properties: { name: { type: "string" }, age: { type: "number", minimum: 0 } },
  };
  it("validates a conforming object", () => {
    expect(validateJsonSchema({ name: "Ada", age: 30 }, schema).valid).toBe(true);
  });
  it("flags a missing required property", () => {
    const result = validateJsonSchema({ name: "Ada" }, schema);
    expect(result.valid).toBe(false);
    expect(result.issues[0]!.path).toContain("age");
  });
  it("flags a type mismatch", () => {
    expect(validateJsonSchema({ name: "Ada", age: "thirty" }, schema).valid).toBe(false);
  });
  it("jsonSchemaValidMetric scores 1/0 accordingly", () => {
    expect(jsonSchemaValidMetric({ name: "Ada", age: 30 }, schema).score).toBe(1);
    expect(jsonSchemaValidMetric({ age: 30 }, schema).score).toBe(0);
  });
});

describe("semantic_similarity", () => {
  it("scores near 1.0 for identical vectors", () => {
    expect(semanticSimilarity([1, 0, 0], [1, 0, 0]).score).toBeCloseTo(1, 5);
  });
  it("scores near 0.5 for orthogonal vectors (cosine 0 rescaled)", () => {
    expect(semanticSimilarity([1, 0], [0, 1]).score).toBeCloseTo(0.5, 5);
  });
  it("cosineSimilarity handles mismatched/zero vectors without throwing", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe("llm_judge", () => {
  it("builds a prompt that includes the (editable) rubric verbatim", () => {
    const prompt = buildJudgePrompt({ rubric: "Custom rubric XYZ", input: "2+2?", output: "4" });
    expect(prompt).toContain("Custom rubric XYZ");
    expect(prompt).toContain("2+2?");
  });
  it("uses the documented default rubric when none is overridden", () => {
    // A bare length check (`.length > 10`) would pass for ANY non-trivial
    // string, including a regression that replaced the rubric with
    // unrelated placeholder text. Assert the actual substantive content:
    // the documented 0-10 scoring scale, the correctness/completeness
    // criteria, and the required JSON response shape.
    expect(DEFAULT_JUDGE_RUBRIC).toContain("0 to 10");
    expect(DEFAULT_JUDGE_RUBRIC).toMatch(/correct/i);
    expect(DEFAULT_JUDGE_RUBRIC).toMatch(/complete/i);
    expect(DEFAULT_JUDGE_RUBRIC).toContain('"score"');
    expect(DEFAULT_JUDGE_RUBRIC).toContain('"rationale"');
    // And confirm it actually flows into the built prompt verbatim.
    const prompt = buildJudgePrompt({ rubric: DEFAULT_JUDGE_RUBRIC, input: "2+2?", output: "4" });
    expect(prompt).toContain(DEFAULT_JUDGE_RUBRIC);
  });
  it("parses a well-formed JSON judge response", () => {
    const verdict = parseJudgeResponse('{"score": 8, "rationale": "mostly correct"}');
    expect(verdict.score).toBeCloseTo(0.8, 5);
    expect(verdict.rationale).toBe("mostly correct");
  });
  it("parses a JSON response embedded in surrounding prose", () => {
    const verdict = parseJudgeResponse('Sure, here is my verdict: {"score": 10, "rationale": "perfect"} Thanks!');
    expect(verdict.score).toBeCloseTo(1, 5);
  });
  it("falls back gracefully on unparseable text", () => {
    const verdict = parseJudgeResponse("I cannot decide.");
    expect(verdict.score).toBe(0.5);
  });
  it("heuristicJudgeScore (mock-provider fallback) scores high lexical overlap with the reference higher", () => {
    const good = heuristicJudgeScore("Paris is the capital of France.", "Paris is the capital of France.");
    const bad = heuristicJudgeScore("Bananas are yellow.", "Paris is the capital of France.");
    expect(good.score).toBeGreaterThan(bad.score);
  });
});

describe("pairwise", () => {
  it("builds a prompt containing both candidate responses", () => {
    const prompt = buildPairwisePrompt({ input: "q", a: "resp A", b: "resp B" });
    expect(prompt).toContain("resp A");
    expect(prompt).toContain("resp B");
  });
  it("parses a JSON winner verdict", () => {
    expect(parsePairwiseResponse('{"winner": "B", "rationale": "clearer"}').winner).toBe("B");
  });
  it("scores 1 when the evaluated slot won, 0 when it lost, 0.5 on tie", () => {
    expect(pairwiseScore({ winner: "A", rationale: "" }, "A")).toBe(1);
    expect(pairwiseScore({ winner: "B", rationale: "" }, "A")).toBe(0);
    expect(pairwiseScore({ winner: "tie", rationale: "" }, "A")).toBe(0.5);
  });
  it("detects position-bias-free agreement after an A/B swap", () => {
    // Same underlying response won both times (forward says A won, swapped says B won -> consistent).
    expect(verdictsAgreeAfterSwap({ winner: "A", rationale: "" }, { winner: "B", rationale: "" })).toBe(true);
    // Position bias: judge picked whichever slot was "A" both times -> same letter -> NOT consistent.
    expect(verdictsAgreeAfterSwap({ winner: "A", rationale: "" }, { winner: "A", rationale: "" })).toBe(false);
  });
  it("heuristicPairwiseVerdict picks the response with higher lexical overlap with the expected answer", () => {
    const verdict = heuristicPairwiseVerdict("Paris is the capital of France.", "Bananas are yellow.", "Paris is the capital of France.");
    expect(verdict.winner).toBe("A");
  });
});

describe("rag_* metrics", () => {
  const contexts = toContextArray([
    "The Eiffel Tower is located in Paris, France.",
    "Paris is the capital city of France.",
  ]);

  it("rag_faithfulness: scores high when output sentences are grounded in context", () => {
    const result = ragFaithfulness("The Eiffel Tower is located in Paris, France.", contexts);
    expect(result.score).toBeGreaterThan(0.9);
  });
  it("rag_faithfulness: scores low for an ungrounded hallucinated sentence", () => {
    const result = ragFaithfulness("Bananas grow on volcanoes in winter.", contexts);
    expect(result.score).toBeLessThan(0.3);
  });
  it("rag_answer_relevance: scores high when the answer addresses the query's terms", () => {
    const result = ragAnswerRelevance("Paris is the capital of France.", "What is the capital of France?");
    expect(result.score).toBeGreaterThan(0.4);
  });
  it("rag_context_precision: scores high when retrieved chunks are on-topic", () => {
    const result = ragContextPrecision(contexts, "Paris is the capital of France");
    expect(result.score).toBeGreaterThan(0.5);
  });
  it("rag_context_precision: scores 0 for entirely off-topic context", () => {
    const result = ragContextPrecision(["Bananas are a good source of potassium."], "Paris is the capital of France");
    expect(result.score).toBe(0);
  });
  it("rag_context_recall: scores high when expected answer's terms appear in context", () => {
    const result = ragContextRecall(contexts, "Paris is the capital of France");
    expect(result.score).toBeGreaterThan(0.5);
  });
  it("rag_context_recall: scores 0 when expected answer's terms are absent from context", () => {
    const result = ragContextRecall(["unrelated text about cars"], "Paris is the capital of France");
    expect(result.score).toBe(0);
  });
});

describe("latency / cost", () => {
  it("latency scores 1 at/under the threshold", () => {
    expect(latencyMetric(500, 3000).score).toBe(1);
  });
  it("latency scores 0 at/beyond 2x the threshold", () => {
    expect(latencyMetric(6000, 3000).score).toBe(0);
  });
  it("latency scores partially between 1x and 2x the threshold", () => {
    const score = latencyMetric(4500, 3000).score;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
  it("cost scores 1 at/under the threshold and 0 beyond 2x", () => {
    expect(costMetric(0.005, 0.01).score).toBe(1);
    expect(costMetric(0.02, 0.01).score).toBe(0);
  });
});
