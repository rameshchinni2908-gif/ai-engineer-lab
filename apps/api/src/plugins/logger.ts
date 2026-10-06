import type { FastifyServerOptions } from "fastify";
import { randomUUID } from "node:crypto";
import type { LogFn } from "pino";
import {
  sanitizeErrorForLogging,
  sanitizeForLogging,
  sanitizeLogMergeObject,
  sanitizeLogMessage,
} from "./log-sanitize.js";

/**
 * Shared Pino logger configuration for the Fastify app. Exported as its own
 * function (rather than inlined in `app.ts`) so `app.redaction.test.ts` can
 * build a logger with the EXACT same config against a capturable stream and
 * assert on real serialized log output, instead of only asserting on the
 * config object.
 *
 * SECURITY (CLAUDE.md, Wave-3 reviewer MAJOR finding): "never log raw
 * prompts/PII-bearing fields" was previously enforced by a hand-picked
 * deny-list of field names (`prompt`, `messages`, ...) that every new route
 * across 13 module folders could silently reopen by introducing a new
 * free-text field (`goal`, `query`, `text`, `code`, ...). This is now a
 * structural deny-by-default policy - see `log-sanitize.ts` for the actual
 * allow-list and rationale. Four layers close the gap regardless of field
 * name, call-site, or whether the string reaches pino as the merge object
 * or the message:
 *   1. `serializers.req`/`serializers.body` sanitize the common
 *      "log the request" / "log the body" patterns.
 *   2. `hooks.logMethod` sanitizes the merging object (`inputArgs[0]`) of
 *      EVERY log call site-wide, so even a top-level spread
 *      (`log.info(req.body, "...")`) is caught, not just
 *      `{ body: ... }`/`{ req: ... }` wrapping.
 *   3. SECURITY (sandbox BLOCKER, 2026-10-06, confirmed live): the SAME hook
 *      also sanitizes `inputArgs[1]` when it is a string - pino's *message*
 *      argument (`log.warn(obj, msg)`). This was the actual hole: a Zod
 *      `invalid_enum_value` error echoes the attacker-submitted field value
 *      verbatim into `err.message`, and `error-handler.ts` was logging that
 *      string as the pino message - a path layer 2 never touches, because
 *      layer 2 only ever looks at `inputArgs[0]`. See
 *      `sanitizeLogMessage` in `log-sanitize.ts` for exactly what
 *      pattern-based redaction this applies to free text (and why it can't
 *      be the same strict allow-list layer 2 uses - a message has no key to
 *      check against an allow-list).
 *   4. `serializers.err` sanitizes `err.message` before pino's own `err`
 *      serializer renders it, because `err` is deliberately exempted from
 *      layer 2 (`SERIALIZER_OWNED_TOP_LEVEL_KEYS` in `log-sanitize.ts`) so
 *      pino's serializer - not our generic object walker - owns shaping it.
 *      Without this, logging `{ err }` directly (every 5xx path) would
 *      write `err.message`/`err.stack` raw, unsanitized by any of the above.
 * `redact.paths` is kept only for header-level secrets (`authorization`,
 * `x-api-key`, `cookie`), which are a small, non-growing, well-known set
 * unlike free-text body fields.
 * See `app.redaction.test.ts` for tests asserting against the real
 * written-out log stream, including a non-canonical field name
 * (`goal`/`query`/`text`/`code`) that the OLD deny-list never covered, and
 * the dynamic-message / `{ err }` shapes that the sandbox BLOCKER exploited.
 */
export function buildLoggerOptions(): FastifyServerOptions["logger"] {
  return {
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'req.headers["x-api-key"]',
      ],
      censor: "[redacted]",
    },
    serializers: {
      req(request: { method: string; url: string; headers: unknown; body?: unknown }) {
        return {
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: sanitizeForLogging(request.body),
        };
      },
      body: sanitizeForLogging,
      err: sanitizeErrorForLogging,
    },
    hooks: {
      logMethod(inputArgs: Parameters<LogFn>, method: LogFn) {
        if (inputArgs.length > 0 && typeof inputArgs[0] === "object" && inputArgs[0] !== null) {
          inputArgs[0] = sanitizeLogMergeObject(inputArgs[0] as Record<string, unknown>);
        }
        // Layer 3: sanitize the free-text pino *message* argument too - see
        // the class-level comment above for why this can't be skipped just
        // because layer 2 already ran.
        if (inputArgs.length > 1 && typeof inputArgs[1] === "string") {
          (inputArgs as unknown as [unknown, string, ...unknown[]])[1] = sanitizeLogMessage(
            inputArgs[1],
          );
        }
        method.apply(this, inputArgs);
      },
    },
  };
}

export function genReqId(req: { headers: Record<string, unknown> }): string {
  const header = req.headers["x-request-id"];
  if (typeof header === "string" && header.length > 0) return header;
  return randomUUID();
}
