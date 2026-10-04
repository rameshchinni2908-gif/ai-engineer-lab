import type { FastifyRequest } from "fastify";
import type { ZodTypeAny, z } from "zod";
import { validationError } from "../middleware/errors.js";

/**
 * Zod validation helpers used by every route handler to parse `body`/
 * `query`/`params` against a shared (`@ail/shared`) or route-local Zod
 * schema. On failure, throws an `ApiHttpError` the central error handler
 * turns into the standard `ApiErrorSchema` 400 `VALIDATION_ERROR` envelope -
 * so every route in the app gets identical validation-error shape for free.
 */
function parse<S extends ZodTypeAny>(schema: S, value: unknown, label: string): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") ?? label;
    throw validationError(`${label}${path ? `.${path}` : ""}: ${issue?.message ?? "invalid"}`, {
      path,
      issues: result.error.issues,
    });
  }
  return result.data;
}

export function parseBody<S extends ZodTypeAny>(schema: S, req: FastifyRequest): z.infer<S> {
  return parse(schema, req.body, "body");
}

export function parseQuery<S extends ZodTypeAny>(schema: S, req: FastifyRequest): z.infer<S> {
  return parse(schema, req.query, "query");
}

export function parseParams<S extends ZodTypeAny>(schema: S, req: FastifyRequest): z.infer<S> {
  return parse(schema, req.params, "params");
}
