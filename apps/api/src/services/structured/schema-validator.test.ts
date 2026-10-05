import { describe, expect, it } from "vitest";
import { validateJson } from "./schema-validator.js";

const PERSON_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    age: { type: "integer", minimum: 0, maximum: 150 },
    role: { type: "string", enum: ["admin", "user"] },
  },
  required: ["name", "age"],
  additionalProperties: false,
};

describe("validateJson", () => {
  it("passes a value that matches the schema exactly", () => {
    const result = validateJson({ name: "Ada", age: 30, role: "admin" }, PERSON_SCHEMA);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("reports a missing required field with the correct path", () => {
    const result = validateJson({ age: 30 }, PERSON_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "name" && e.message.includes("Missing required"))).toBe(true);
  });

  it("reports a type mismatch for a wrong-typed field", () => {
    const result = validateJson({ name: "Ada", age: "thirty" }, PERSON_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "age")).toBe(true);
  });

  it("rejects a value outside the enum", () => {
    const result = validateJson({ name: "Ada", age: 30, role: "superadmin" }, PERSON_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "role")).toBe(true);
  });

  it("rejects additional properties when additionalProperties is false", () => {
    const result = validateJson({ name: "Ada", age: 30, extra: "nope" }, PERSON_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "extra")).toBe(true);
  });

  it("enforces numeric minimum/maximum", () => {
    const tooOld = validateJson({ name: "Ada", age: 999 }, PERSON_SCHEMA);
    expect(tooOld.valid).toBe(false);
    const negative = validateJson({ name: "Ada", age: -5 }, PERSON_SCHEMA);
    expect(negative.valid).toBe(false);
  });

  it("validates array items against an items schema", () => {
    const schema = { type: "array", items: { type: "number" } };
    expect(validateJson([1, 2, 3], schema).valid).toBe(true);
    expect(validateJson([1, "two", 3], schema).valid).toBe(false);
  });

  it("validates nested objects recursively", () => {
    const schema = {
      type: "object",
      properties: { address: { type: "object", properties: { zip: { type: "string" } }, required: ["zip"] } },
    };
    expect(validateJson({ address: { zip: "12345" } }, schema).valid).toBe(true);
    expect(validateJson({ address: {} }, schema).valid).toBe(false);
  });

  it("rejects a non-object schema input", () => {
    const result = validateJson({ a: 1 }, "not a schema");
    expect(result.valid).toBe(false);
  });

  it("handles integer vs number distinction", () => {
    const schema = { type: "integer" };
    expect(validateJson(5, schema).valid).toBe(true);
    expect(validateJson(5.5, schema).valid).toBe(false);
  });
});
