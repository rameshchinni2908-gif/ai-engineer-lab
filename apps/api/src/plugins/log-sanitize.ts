/**
 * Deny-by-default log sanitization. CLAUDE.md: "Never log raw prompts
 * containing PII." The previous approach denied a hand-picked list of field
 * names (`prompt`, `messages`, `system`, ...) - but the 13 route folders
 * built across Wave 2 introduced dozens of OTHER free-text fields (`text`,
 * `query`, `goal`, `template`, `code`, document text, eval case
 * inputs/expected, ...) that were never redacted, simply because nobody
 * enumerated them. Enumerating every free-text field name is a losing
 * strategy - the next field added anywhere reopens the hole.
 *
 * Policy, inverted: every string value is redacted UNLESS its key is on a
 * small, explicit allow-list of genuinely safe, non-user-content fields -
 * `providerId`, `model`, `moduleId`, `feature`, `strategy`, `runtime`,
 * `metricId`, `status`, `driver`, `mode`, `owaspId`, `severity`,
 * `action`, `layer`, `category`, `kind`, `toolChoice`, plus any key that is
 * `id`/`ids` or ends in `Id` (the `<thing>Id` naming convention used
 * throughout docs/contracts.md - `runId`, `traceId`, `documentId`,
 * `chunkId`, `datasetId`, `parentRunId`, `toolCallId`, `requestId`, ... -
 * opaque identifiers, never free text, without having to enumerate each
 * one). Numbers and booleans are always safe to log (a number/boolean
 * cannot carry a prompt). Everything else is replaced with `"[redacted]"`.
 * Objects/arrays are walked recursively so nesting can't smuggle an unsafe
 * field past the allow-list, and every kept string is still length-capped
 * defensively.
 *
 * NOTE (documented tradeoff, see docs/backend-api.md): `code` is
 * deliberately NOT on the safe list even though our own error handler logs
 * `{ code: err.code }` for debugging - M3's sandbox/tool-call routes use
 * that exact key name for free-text source code, and the ambiguity isn't
 * worth the risk. `code` is redacted everywhere, including in our own
 * debug logs; use `requestId` (an `Id`-suffixed, always-safe field) to
 * correlate a redacted log line back to its `ApiErrorSchema` response
 * instead.
 */

import pino from "pino";

const SAFE_STRING_KEYS = new Set([
  "providerId",
  "model",
  "moduleId",
  "feature",
  "strategy",
  "runtime",
  "metricId",
  "status",
  "driver",
  "mode",
  "owaspId",
  "severity",
  "action",
  "layer",
  "category",
  "kind",
  "toolChoice",
]);

const MAX_SAFE_STRING_LEN = 200;
const MAX_ARRAY_ITEMS = 25;
const MAX_DEPTH = 6;

function isIdKey(key: string): boolean {
  return key === "id" || key === "ids" || /Id$/.test(key);
}

function isSafeScalar(key: string, value: string | number | boolean): boolean {
  if (typeof value === "boolean" || typeof value === "number") return true;
  return SAFE_STRING_KEYS.has(key) || isIdKey(key);
}

function truncate(value: string): string {
  return value.length > MAX_SAFE_STRING_LEN
    ? `${value.slice(0, MAX_SAFE_STRING_LEN)}...(truncated)`
    : value;
}

/** Recursively sanitizes `value`, treating `key` as the property name it was found under. */
function sanitizeValue(key: string, value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[redacted:max-depth]";
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((v) => sanitizeValue(key, v, depth + 1));
  }

  if (typeof value === "object") {
    return sanitizeObject(value as Record<string, unknown>, depth + 1);
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (!isSafeScalar(key, value)) return "[redacted]";
    return typeof value === "string" ? truncate(value) : value;
  }

  // function/symbol/bigint etc. - never log, no legitimate reason to.
  return "[redacted]";
}

/** Recursively sanitizes every entry of a plain object. Top-level entry point for `body`-shaped values. */
export function sanitizeObject(obj: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > MAX_DEPTH) return { "[redacted]": "max-depth" };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = sanitizeValue(k, v, depth + 1);
  }
  return out;
}

/** Sanitizes an arbitrary value that may or may not be a plain object (used for `body`-like serializer inputs). */
export function sanitizeForLogging(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((v) => sanitizeForLogging(v));
  }
  if (typeof value === "object") return sanitizeObject(value as Record<string, unknown>);
  return value;
}

/**
 * Keys pino's `req`/`res`/`err` serializers already own - skipped here so
 * `hooks.logMethod` doesn't fight with (or double-process) their dedicated
 * serializers; the `req` serializer itself calls `sanitizeForLogging` on
 * `request.body` directly (see `logger.ts`).
 */
const SERIALIZER_OWNED_TOP_LEVEL_KEYS = new Set(["req", "res", "err"]);

/**
 * Sanitizes the top-level merging object passed to ANY `log.info(obj, msg)`
 * / `log.error(obj, msg)` call, site-wide - this is what closes the gap for
 * field names nobody thought to redact, including a future
 * `log.info(req.body, "...")` that spreads body fields at the TOP level
 * (not nested under a `body` key at all). `req`/`res`/`err` are left alone
 * so their dedicated pino serializers still run.
 */
export function sanitizeLogMergeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SERIALIZER_OWNED_TOP_LEVEL_KEYS.has(k) ? v : sanitizeValue(k, v, 1);
  }
  return out;
}

/**
 * SECURITY (sandbox BLOCKER, 2026-10-06): pino's *message* argument
 * (`log.warn(obj, msg)`'s second positional arg) is a free-text string we
 * cannot run through `sanitizeValue`'s key-based allow-list - there is no
 * key, it's the message itself. The hole this closes: `error-handler.ts`
 * (and any future call site) was passing user-influenced text - e.g. a Zod
 * `invalid_enum_value` message, which echoes the submitted value verbatim -
 * straight through as `msg`, bypassing `sanitizeLogMergeObject` entirely
 * since that function only ever sees `inputArgs[0]`.
 *
 * We deliberately do NOT redact every message wholesale - this function is
 * applied to EVERY log call site-wide, including our own static strings
 * ("incoming request", "request completed", "validation failed", ...), and
 * those must read unmangled in production logs or this just trades a PII
 * leak for an unreadable log stream nobody trusts enough to keep the check.
 * We cannot distinguish "literal string we wrote" from "string built with
 * interpolated user input" at runtime - both are just `string` by the time
 * they reach this hook. So the policy is pattern-based, not identity-based:
 * redact substrings that *look like* a secret/PII shape, and length-cap the
 * rest, regardless of who wrote the message. This is deliberately narrower
 * than the merge-object allow-by-exception policy above (which can afford
 * to be strict because every field there has a name to key off of) - here
 * we only strike what we can positively identify, so a normal English log
 * message survives untouched. See `MESSAGE_SECRET_PATTERNS` below for
 * exactly what that is and is not.
 */
const MESSAGE_SECRET_PATTERNS: RegExp[] = [
  // US SSN shape: 123-45-6789 (with word boundaries so it also catches it
  // embedded inside a larger token, e.g. "sentinel-ssn-123-45-6789").
  /\d{3}-\d{2}-\d{4}/g,
  // Email addresses.
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  // Bearer/authorization-header-style tokens.
  /\bBearer\s+[A-Za-z0-9._-]+/gi,
  // Common provider API-key prefixes (OpenAI/Anthropic/Stripe-style sk-/pk-/rk- secrets).
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{6,}/gi,
  // Long opaque alphanumeric tokens (>= 20 chars) - JWTs, session ids, API
  // keys with no recognizable prefix. 20 is chosen to clear ordinary words
  // and identifiers (UUIDs with hyphens still match - that's intentional,
  // callers needing a visible UUID should use an `...Id` key in the merge
  // object instead, which `sanitizeLogMergeObject` allow-lists).
  /\b[A-Za-z0-9_-]{20,}\b/g,
  // Zod's "received 'X'" / "Expected 'X', received 'Y'" shape echoes the
  // raw submitted value inside single quotes - this is the exact vector
  // confirmed live against `validation.ts`. Redact anything quoted that's
  // long enough to plausibly be user input rather than a short enum/type
  // name (quoted enum options like 'anthropic' are <= 10 chars and benign).
  /'([^']{11,})'/g,
];

const MAX_MESSAGE_LEN = 500;

/**
 * Sanitizes the pino message-string argument (the second positional arg of
 * `log.warn(obj, msg)` etc). Applied to every log call via
 * `hooks.logMethod`. See the policy rationale above `MESSAGE_SECRET_PATTERNS`.
 */
export function sanitizeLogMessage(msg: string): string {
  let out = msg.length > MAX_MESSAGE_LEN ? `${msg.slice(0, MAX_MESSAGE_LEN)}...(truncated)` : msg;
  for (const pattern of MESSAGE_SECRET_PATTERNS) {
    out = out.replace(pattern, "[redacted]");
  }
  return out;
}

/**
 * SECURITY (sandbox BLOCKER, 2026-10-06): `err` is intentionally exempt
 * from `sanitizeLogMergeObject` (see `SERIALIZER_OWNED_TOP_LEVEL_KEYS`
 * above) so pino's own `err` serializer - not our generic object walker -
 * owns shaping `{ type, message, stack, ... }`. But that means nothing was
 * sanitizing `err.message` before it reached pino, and `err.message` is
 * exactly where user-controlled text lands: `validation.ts` folds Zod's
 * `issue.message` into the thrown `ApiHttpError`'s `message`, and Zod's own
 * `invalid_enum_value` message echoes the submitted value verbatim. This
 * serializer runs pino's default `err` serializer first (so shape/behavior
 * for non-sanitization fields - `type`, nested `cause`, etc. - is
 * unchanged), then overwrites `message` with the same pattern-based
 * `sanitizeLogMessage` used for the pino message argument, and also patches
 * the first line of `stack` (which Node renders as `${name}: ${message}`)
 * so the raw value can't resurface there either. The REST of `stack` (the
 * call-site frames) is left untouched and still server-side-only - it's
 * file paths and line numbers, not attacker-controlled text, and
 * CLAUDE.md's logging rule is about not leaking PII/secrets, not about
 * hiding stack traces from our own operators.
 */
export function sanitizeErrorForLogging(
  err: Parameters<typeof pino.stdSerializers.err>[0],
): ReturnType<typeof pino.stdSerializers.err> {
  const serialized = pino.stdSerializers.err(err);
  if (typeof serialized.message === "string") {
    serialized.message = sanitizeLogMessage(serialized.message);
    if (typeof serialized.stack === "string") {
      const lines = serialized.stack.split("\n");
      lines[0] = sanitizeLogMessage(lines[0] ?? "");
      serialized.stack = lines.join("\n");
    }
  }
  return serialized;
}
