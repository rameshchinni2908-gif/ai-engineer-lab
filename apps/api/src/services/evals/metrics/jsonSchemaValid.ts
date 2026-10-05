/**
 * `json_schema_valid`: a minimal, pure JSON-Schema-subset validator (type,
 * required, properties, items, enum, minimum/maximum, minLength/maxLength).
 * Intentionally small - this is a teaching metric, not a spec-complete
 * validator - but every check it does make is real and testable.
 */

export interface SchemaIssue {
  path: string;
  message: string;
}

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function validateNode(value: unknown, schema: JsonSchema, path: string, issues: SchemaIssue[]): void {
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    issues.push({ path, message: `value is not one of the allowed enum values` });
  }

  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const ok = allowed.includes(actual) || (allowed.includes("number") && actual === "number");
    if (!ok) {
      issues.push({ path, message: `expected type ${allowed.join(" | ")}, got ${actual}` });
      return; // further structural checks would be meaningless on a type mismatch
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({ path, message: `string shorter than minLength ${schema.minLength}` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push({ path, message: `string longer than maxLength ${schema.maxLength}` });
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({ path, message: `number below minimum ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({ path, message: `number above maximum ${schema.maximum}` });
    }
  }

  if (schema.properties && typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) {
        issues.push({ path: `${path}.${key}`, message: "required property missing" });
      }
    }
    for (const [key, subSchema] of Object.entries(schema.properties)) {
      if (key in obj) {
        validateNode(obj[key], subSchema, `${path}.${key}`, issues);
      }
    }
  }

  if (schema.items && Array.isArray(value)) {
    value.forEach((item, idx) => validateNode(item, schema.items!, `${path}[${idx}]`, issues));
  }
}

export function validateJsonSchema(value: unknown, schema: unknown): { valid: boolean; issues: SchemaIssue[] } {
  const issues: SchemaIssue[] = [];
  validateNode(value, (schema ?? {}) as JsonSchema, "$", issues);
  return { valid: issues.length === 0, issues };
}

/** `json_schema_valid` metric: 1 if `candidate` validates against `schema`, else 0. */
export function jsonSchemaValidMetric(
  candidate: unknown,
  schema: unknown,
): { score: number; rationale: string } {
  const { valid, issues } = validateJsonSchema(candidate, schema);
  return {
    score: valid ? 1 : 0,
    rationale: valid
      ? "Output validated against the provided JSON Schema."
      : `Schema validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
  };
}
