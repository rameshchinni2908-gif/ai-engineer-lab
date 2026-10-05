/**
 * M3 schema validation (`POST /structured/validate` - contracts.md §4 M3).
 * A minimal, dependency-free JSON Schema (draft-07-ish) validator covering
 * the subset this app's teaching schemas need: `type`, `required`,
 * `properties`, `items`, `enum`, `minimum`/`maximum`, `minLength`/
 * `maxLength`, `pattern`, `additionalProperties: false`. Pure, synchronous,
 * no LLM call per contracts.md ("Pure function (unit-tested); no LLM call,
 * no Run").
 *
 * This intentionally does NOT depend on a third-party JSON Schema library -
 * `apps/api`'s dependencies are owned by the project scaffold (architect),
 * not this module, so adding one would be an out-of-scope package.json edit.
 */

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// Schemas and data both arrive as `unknown` over the wire - this validator's
// whole job is to narrow them safely, so `unknown` (not `any`) is used
// throughout and every property access goes through a type guard.
type JsonSchema = Record<string, unknown>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value; // "string" | "number" | "boolean" | "object" | "undefined" | ...
}

function matchesType(value: unknown, expected: string): boolean {
  if (expected === "integer") return typeof value === "number" && Number.isInteger(value);
  if (expected === "number") return typeof value === "number";
  return typeOf(value) === expected;
}

/** Pure, recursive validation. Appends errors (path, message) rather than throwing. */
function validateNode(value: unknown, schema: JsonSchema, path: string, errors: ValidationError[]): void {
  const expectedType = schema.type;
  if (typeof expectedType === "string") {
    if (!matchesType(value, expectedType)) {
      errors.push({ path: path || "$", message: `Expected type "${expectedType}" but got "${typeOf(value)}"` });
      return; // further checks (properties/items/etc.) would be noise once the base type is already wrong
    }
  } else if (Array.isArray(expectedType)) {
    const allowed = expectedType.filter((t): t is string => typeof t === "string");
    if (!allowed.some((t) => matchesType(value, t))) {
      errors.push({ path: path || "$", message: `Expected one of types [${allowed.join(", ")}] but got "${typeOf(value)}"` });
      return;
    }
  }

  const enumValues = schema.enum;
  if (Array.isArray(enumValues) && !enumValues.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push({ path: path || "$", message: `Value is not one of the allowed enum values` });
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push({ path: path || "$", message: `String shorter than minLength ${schema.minLength}` });
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push({ path: path || "$", message: `String longer than maxLength ${schema.maxLength}` });
    }
    if (typeof schema.pattern === "string") {
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          errors.push({ path: path || "$", message: `String does not match pattern ${schema.pattern}` });
        }
      } catch {
        // malformed pattern in the schema itself - surface as a schema problem, not a silent pass
        errors.push({ path: path || "$", message: `Schema pattern "${schema.pattern}" is not a valid regular expression` });
      }
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push({ path: path || "$", message: `Value ${value} is below minimum ${schema.minimum}` });
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push({ path: path || "$", message: `Value ${value} is above maximum ${schema.maximum}` });
    }
  }

  if (Array.isArray(value) && isPlainObject(schema.items)) {
    value.forEach((item, i) => validateNode(item, schema.items as JsonSchema, `${path}[${i}]`, errors));
  }

  if (isPlainObject(value) && isPlainObject(schema.properties)) {
    const required = Array.isArray(schema.required) ? schema.required.filter((r): r is string => typeof r === "string") : [];
    for (const key of required) {
      if (!(key in value)) {
        errors.push({ path: path ? `${path}.${key}` : key, message: `Missing required field "${key}"` });
      }
    }
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in value && isPlainObject(propSchema)) {
        validateNode(value[key], propSchema, path ? `${path}.${key}` : key, errors);
      }
    }
    if (schema.additionalProperties === false) {
      const allowedKeys = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
          errors.push({ path: path ? `${path}.${key}` : key, message: `Unexpected additional property "${key}"` });
        }
      }
    }
  }
}

/** `POST /structured/validate`: validates `json` against `schema`, pure and synchronous. */
export function validateJson(json: unknown, schema: unknown): ValidationResult {
  if (!isPlainObject(schema)) {
    return { valid: false, errors: [{ path: "$", message: "Schema must be a JSON object" }] };
  }
  const errors: ValidationError[] = [];
  validateNode(json, schema, "", errors);
  return { valid: errors.length === 0, errors };
}
