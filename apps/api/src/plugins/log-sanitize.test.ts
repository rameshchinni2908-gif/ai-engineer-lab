import { describe, expect, it } from "vitest";
import { sanitizeForLogging, sanitizeLogMergeObject, sanitizeObject } from "./log-sanitize.js";

describe("sanitizeObject / sanitizeForLogging - deny by default", () => {
  it("redacts free-text fields regardless of key name (not just a hand-picked list)", () => {
    const out = sanitizeObject({
      goal: "find my social security number 123-45-6789",
      query: "what is Jane Public's address",
      text: "raw document text with PII",
      code: "print(user_ssn)",
      template: "Hello {{name}}, your card is {{cc}}",
      seedExamples: [{ input: "secret seed example" }],
    });
    expect(out.goal).toBe("[redacted]");
    expect(out.query).toBe("[redacted]");
    expect(out.text).toBe("[redacted]");
    expect(out.code).toBe("[redacted]");
    expect(out.template).toBe("[redacted]");
    expect(JSON.stringify(out.seedExamples)).not.toContain("secret seed example");
  });

  it("still redacts the originally-named fields (prompt/messages/system/apiKey)", () => {
    const out = sanitizeObject({
      prompt: "a secret prompt",
      system: "a secret system prompt",
      messages: [{ role: "user", content: "secret" }],
      apiKey: "sk-should-not-appear",
    });
    expect(out.prompt).toBe("[redacted]");
    expect(out.system).toBe("[redacted]");
    expect(JSON.stringify(out.messages)).not.toContain("secret");
    expect(out.apiKey).toBe("[redacted]");
  });

  it("allow-lists safe, non-user-content fields", () => {
    const out = sanitizeObject({
      providerId: "mock",
      model: "mock-small",
      moduleId: "fundamentals",
      feature: "sampling-lab",
      strategy: "sliding-window",
      runtime: "react",
      metricId: "exact_match",
      temperature: 0.8,
      topK: 5,
      maxTokens: 256,
      seed: 42,
      runId: "run_abc123",
      documentId: "doc_1",
      ids: ["a", "b"],
      jsonMode: true,
    });
    expect(out).toEqual({
      providerId: "mock",
      model: "mock-small",
      moduleId: "fundamentals",
      feature: "sampling-lab",
      strategy: "sliding-window",
      runtime: "react",
      metricId: "exact_match",
      temperature: 0.8,
      topK: 5,
      maxTokens: 256,
      seed: 42,
      runId: "run_abc123",
      documentId: "doc_1",
      ids: ["a", "b"],
      jsonMode: true,
    });
  });

  it("recurses into nested objects/arrays so an unsafe field can't hide", () => {
    const out = sanitizeObject({
      data: { nested: { prompt: "hidden secret" } },
      cases: [{ expected: "the real answer is 42, PII: 123-45-6789" }],
    });
    expect(JSON.stringify(out)).not.toContain("hidden secret");
    expect(JSON.stringify(out)).not.toContain("123-45-6789");
  });

  it("truncates long safe strings defensively", () => {
    const out = sanitizeObject({ model: "m".repeat(5000) });
    expect((out.model as string).length).toBeLessThan(5000);
    expect(out.model).toContain("...(truncated)");
  });

  it("sanitizeForLogging handles non-object inputs gracefully", () => {
    expect(sanitizeForLogging(undefined)).toBeUndefined();
    expect(sanitizeForLogging("plain string")).toBe("plain string");
  });
});

describe("sanitizeLogMergeObject", () => {
  it("leaves req/res/err keys untouched for pino's own serializers", () => {
    const err = new Error("boom");
    const out = sanitizeLogMergeObject({ err, requestId: "req_123" });
    expect(out.err).toBe(err);
    expect(out.requestId).toBe("req_123");
  });

  it("redacts a non-canonical free-text field spread at the top level", () => {
    const out = sanitizeLogMergeObject({ goal: "secret agent goal with PII 123-45-6789" });
    expect(out.goal).toBe("[redacted]");
  });
});
