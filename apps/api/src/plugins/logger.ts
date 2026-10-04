import type { FastifyServerOptions } from "fastify";
import { randomUUID } from "node:crypto";

/**
 * Shared Pino logger configuration for the Fastify app. Exported as its own
 * function (rather than inlined in `app.ts`) so `app.redaction.test.ts` can
 * build a logger with the EXACT same config against a capturable stream and
 * assert on real serialized log output, instead of only asserting on the
 * config object.
 *
 * SECURITY (CLAUDE.md, Wave-0 reviewer MAJOR finding): never log raw
 * prompts/PII-bearing fields or secrets.
 *   - `redact.paths` uses explicit multi-level paths. `fast-redact` wildcards
 *     (`*`) only match exactly ONE path segment, so the old `*.messages`/
 *     `*.prompt` paths never matched the real logged shape
 *     (`req.body.messages`, `req.body.prompt`).
 *   - A custom `req` serializer deliberately includes `body`/`headers` (many
 *     real apps log the full request for debugging) so these redact paths
 *     have real data to protect rather than being dead configuration -
 *     see `app.redaction.test.ts` for a test that emits a PII-bearing prompt
 *     and a fake provider API key through this exact config and asserts
 *     neither ever appears in the written-out log stream.
 */
export function buildLoggerOptions(): FastifyServerOptions["logger"] {
  return {
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'req.headers["x-api-key"]',
        "req.body.apiKey",
        "req.body.prompt",
        "req.body.system",
        "req.body.messages",
        "req.body.piiFields",
        "res.body.apiKey",
        "err.config.headers.authorization",
        'err.config.headers["x-api-key"]',
      ],
      censor: "[redacted]",
    },
    serializers: {
      req(request: { method: string; url: string; headers: unknown; body?: unknown }) {
        return {
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: request.body,
        };
      },
    },
  };
}

export function genReqId(req: { headers: Record<string, unknown> }): string {
  const header = req.headers["x-request-id"];
  if (typeof header === "string" && header.length > 0) return header;
  return randomUUID();
}
