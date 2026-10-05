import { describe, expect, it } from "vitest";
import { validateCandidate, buildRepairPrompt } from "./repair.js";

const SCHEMA = {
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
};

describe("validateCandidate", () => {
  it("returns valid:true for well-formed JSON matching the schema", () => {
    const result = validateCandidate('{"name":"Ada"}', SCHEMA);
    expect(result.valid).toBe(true);
  });

  it("returns a JSON-syntax error for malformed JSON, without throwing", () => {
    const result = validateCandidate("{not valid json", SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toMatch(/JSON syntax/i);
  });

  it("returns a schema validation error for well-formed JSON that doesn't match the schema", () => {
    const result = validateCandidate("{}", SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "name")).toBe(true);
  });
});

describe("buildRepairPrompt", () => {
  it("includes the invalid JSON, the schema, and every specific validation error", () => {
    const prompt = buildRepairPrompt("{}", SCHEMA, [{ path: "name", message: 'Missing required field "name"' }]);
    expect(prompt).toContain("{}");
    expect(prompt).toContain("name");
    expect(prompt).toContain('Missing required field "name"');
  });

  it("instructs the model to return ONLY corrected JSON with no commentary", () => {
    const prompt = buildRepairPrompt("{}", SCHEMA, []);
    expect(prompt).toMatch(/ONLY the corrected JSON/i);
  });
});
