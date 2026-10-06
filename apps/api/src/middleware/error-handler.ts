import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiError } from "@ail/shared";
import { ApiHttpError } from "./errors.js";

function isZodLikeValidationError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "validation" in err &&
    Array.isArray((err as { validation?: unknown }).validation)
  );
}

/**
 * Registers the single central Fastify error handler. Every error - thrown
 * `ApiHttpError`s, Fastify's own schema-validation failures, the rate-limit
 * plugin's 429s, and genuinely unexpected exceptions - is normalized to the
 * `ApiErrorSchema` envelope with the request's id, and NEVER leaks a stack
 * trace or env values to the client.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | ApiHttpError, req: FastifyRequest, reply: FastifyReply) => {
    const requestId = String(req.id);

    if (err instanceof ApiHttpError) {
      // SECURITY (sandbox BLOCKER, 2026-10-06, confirmed live): never pass
      // `err.message` as pino's *message* argument - it can carry
      // attacker-controlled text (e.g. Zod's `invalid_enum_value` message
      // echoes the submitted value verbatim) and historically bypassed
      // `sanitizeLogMergeObject`, which only ever sanitizes `inputArgs[0]`.
      // Use a fixed literal for the message and put the detail in the
      // merge object under `errorMessage` - a key that is NOT on
      // `SERIALIZER_OWNED_TOP_LEVEL_KEYS`, so `sanitizeLogMergeObject`
      // actually processes it (unlike `code`/`err`, which are intentionally
      // skipped there). This is still defense-in-depth, not the only line
      // of defense: `logger.ts`'s `hooks.logMethod` now also sanitizes any
      // string message argument, and `serializers.err` sanitizes
      // `err.message` before pino's own serializer renders it.
      if (err.statusCode >= 500) req.log.error({ err, requestId }, "request failed");
      else req.log.warn({ code: err.code, requestId, errorMessage: err.message }, "request failed");
      const body: ApiError = {
        code: err.code,
        message: err.message,
        requestId,
        details: err.details,
      };
      reply.status(err.statusCode).send(body);
      return;
    }

    const statusCode = (err as FastifyError).statusCode;

    if (statusCode === 429) {
      const body: ApiError = {
        code: "RATE_LIMITED",
        message: "Too many requests - per-IP rate limit exceeded.",
        requestId,
      };
      reply.status(429).send(body);
      return;
    }

    if (isZodLikeValidationError(err) || statusCode === 400) {
      req.log.warn({ requestId }, "validation failed");
      const body: ApiError = {
        code: "VALIDATION_ERROR",
        message: err.message,
        requestId,
      };
      reply.status(400).send(body);
      return;
    }

    // Unexpected error: log full detail server-side, never leak it to the client.
    req.log.error({ err, requestId }, "unhandled error");
    const body: ApiError = {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId,
    };
    reply.status(statusCode && statusCode >= 500 ? statusCode : 500).send(body);
  });

  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    const body: ApiError = {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.url} not found.`,
      requestId: String(req.id),
    };
    reply.status(404).send(body);
  });
}
