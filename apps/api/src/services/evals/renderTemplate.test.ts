import { describe, expect, it } from "vitest";
import { renderTemplate } from "./renderTemplate.js";

describe("renderTemplate", () => {
  it("substitutes known variables", () => {
    expect(renderTemplate("Hello {{name}}!", { name: "Ada" })).toBe("Hello Ada!");
  });
  it("leaves unresolved placeholders visible", () => {
    expect(renderTemplate("Hello {{name}}!", {})).toBe("Hello {{name}}!");
  });
  it("stringifies non-string values", () => {
    expect(renderTemplate("count={{count}}", { count: 3 })).toBe("count=3");
  });
});
