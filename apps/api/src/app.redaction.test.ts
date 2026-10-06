import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { PassThrough } from "node:stream";
import pino from "pino";
import { z } from "zod";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-redaction.db");

const { getDb, closeDb } = await import("./db/index.js");
const { registerErrorHandler } = await import("./middleware/error-handler.js");
const { buildLoggerOptions, genReqId } = await import("./plugins/logger.js");
const { parseBody } = await import("./plugins/validation.js");

const PII_PROMPT = "My social security number is 123-45-6789 and my name is Jane Q. Public.";
const FAKE_API_KEY = "sk-live-SUPER_SECRET_DO_NOT_LOG_abcdef123456";
// Matches the live reproduction used to confirm the sandbox BLOCKER: a
// z.enum validation failure echoes the submitted value verbatim into
// `err.message`, which used to be logged raw as pino's message argument.
const PII_SENTINEL = "PIILEAK-SENTINEL-ssn-123-45-6789";

/**
 * Builds a real app using the EXACT same `buildLoggerOptions()`/`genReqId`
 * as `app.ts`, writing logs to an in-memory stream so this test can assert
 * on the real serialized log output - not just on the redact config object -
 * per the Wave-0 reviewer's MAJOR finding.
 */
async function buildAppWithCapturedLogs() {
  const chunks: string[] = [];
  const stream = new PassThrough();
  stream.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf-8")));

  const loggerInstance = pino(buildLoggerOptions() as pino.LoggerOptions, stream);
  const app = Fastify({ loggerInstance, genReqId });

  await app.register(cors, { origin: "http://localhost:5173" });
  registerErrorHandler(app);
  await getDb();

  // Realistic (if dangerous) debugging pattern: logging the whole request -
  // AFTER body parsing - exercises the custom `req` serializer's `body`/
  // `headers` fields exactly as `buildLoggerOptions()` is designed to
  // protect, rather than asserting against dead configuration.
  app.post("/echo", async (req) => {
    req.log.info({ req }, "received request");
    return { ok: true };
  });

  // Exercises the REAL production path: `parseBody` throws a
  // `validationError` whose message interpolates Zod's `issue.message` -
  // which, for `z.enum`, echoes the submitted value verbatim - and
  // `error-handler.ts` is what logs it. This is the exact shape that leaked
  // live against `/api/fundamentals/sample`.
  const ProviderIdSchema = z.enum(["anthropic", "openai", "ollama", "mock"]);
  app.post("/validate-enum", async (req) => {
    parseBody(z.object({ providerId: ProviderIdSchema }), req);
    return { ok: true };
  });

  // Exercises the `{ err }` / pino `serializers.err` path directly: a
  // thrown Error (not an ApiHttpError) whose `.message` carries the
  // sentinel, logged exactly the way the central error handler's
  // "unhandled error" / 5xx branches do.
  app.post("/throw-error", async () => {
    throw new Error(`boom: received '${PII_SENTINEL}'`);
  });

  // Exercises a direct two-arg `log.warn(obj, dynamicString)` call site
  // that interpolates attacker-influenced text directly into the pino
  // message argument - the shape `hooks.logMethod`'s message-sanitization
  // layer (not the merge-object layer) is responsible for catching.
  app.post("/direct-warn", async (req) => {
    req.log.warn({ requestId: String(req.id) }, `dynamic message: ${PII_SENTINEL}`);
    return { ok: true };
  });

  return { app, chunks };
}

describe("Pino redaction (security)", () => {
  afterAll(() => closeDb());

  it("never writes a PII-bearing prompt into the actual log output stream", async () => {
    const { app, chunks } = await buildAppWithCapturedLogs();
    await app.inject({
      method: "POST",
      url: "/echo",
      payload: {
        prompt: PII_PROMPT,
        messages: [{ role: "user", content: PII_PROMPT }],
      },
    });
    await app.close();

    const logOutput = chunks.join("");
    expect(logOutput).not.toContain(PII_PROMPT);
    expect(logOutput).not.toContain("123-45-6789");
    expect(logOutput).toContain("[redacted]");
  });

  it("never writes a provider API key value into the actual log output stream", async () => {
    const { app, chunks } = await buildAppWithCapturedLogs();
    await app.inject({
      method: "POST",
      url: "/echo",
      payload: { apiKey: FAKE_API_KEY },
      headers: { authorization: `Bearer ${FAKE_API_KEY}`, "x-api-key": FAKE_API_KEY },
    });
    await app.close();

    const logOutput = chunks.join("");
    expect(logOutput).not.toContain(FAKE_API_KEY);
  });

  it("redacts a NON-CANONICAL free-text field name (goal/query/text/code) the old hand-picked deny-list never covered", async () => {
    const { app, chunks } = await buildAppWithCapturedLogs();
    const PII_GOAL = "wire $50,000 to account 123-45-6789 for Jane Q. Public";
    await app.inject({
      method: "POST",
      url: "/echo",
      payload: {
        goal: PII_GOAL,
        query: "lookup SSN 123-45-6789",
        text: "raw document text containing 123-45-6789",
        code: "print('123-45-6789')",
      },
    });
    await app.close();

    const logOutput = chunks.join("");
    expect(logOutput).not.toContain(PII_GOAL);
    expect(logOutput).not.toContain("123-45-6789");
    expect(logOutput).toContain("[redacted]");
  });

  it("redacts the Authorization header on every logged request", async () => {
    const { app, chunks } = await buildAppWithCapturedLogs();
    await app.inject({
      method: "POST",
      url: "/echo",
      payload: {},
      headers: { authorization: "Bearer should-not-appear-in-logs" },
    });
    await app.close();

    const logOutput = chunks.join("");
    expect(logOutput).not.toContain("should-not-appear-in-logs");
  });

  // --- Sandbox BLOCKER regression tests (2026-10-06) ------------------
  // The 4 tests above only ever exercise a static-message, single-arg
  // `log.info({ req }, "received request")` call. Production's actual
  // error paths use the two-arg `log.warn(obj, dynamicString)` and
  // `log.error({ err }, msg)` shapes below, which the old tests never
  // touched - exactly the gap that let a real PII leak through.

  it("never writes a PII/secret-shaped sentinel from a real z.enum validation failure into the log stream (the confirmed live repro)", async () => {
    const { app, chunks } = await buildAppWithCapturedLogs();
    const res = await app.inject({
      method: "POST",
      url: "/validate-enum",
      payload: { providerId: PII_SENTINEL },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    const logOutput = chunks.join("");
    // Positive control: without this, a probe that captured nothing would
    // pass every negative assertion below vacuously.
    expect(logOutput).toContain("request failed");
    expect(logOutput).not.toContain(PII_SENTINEL);
    expect(logOutput).not.toContain("123-45-6789");
  });

  it("never writes a sentinel embedded in a thrown Error's message (logged via `{ err }`, pino's err serializer) into the log stream", async () => {
    const { app, chunks } = await buildAppWithCapturedLogs();
    const res = await app.inject({ method: "POST", url: "/throw-error", payload: {} });
    await app.close();

    expect(res.statusCode).toBe(500);
    const logOutput = chunks.join("");
    // Positive control: a plain thrown `Error` (not `ApiHttpError`) takes
    // the central handler's "unhandled error" branch, which logs `{ err }`.
    expect(logOutput).toContain("unhandled error");
    expect(logOutput).not.toContain(PII_SENTINEL);
    expect(logOutput).not.toContain("123-45-6789");
  });

  it("never writes a sentinel passed directly as a dynamic pino message string (`log.warn(obj, dynamicString)`) into the log stream", async () => {
    const { app, chunks } = await buildAppWithCapturedLogs();
    const res = await app.inject({ method: "POST", url: "/direct-warn", payload: {} });
    await app.close();

    expect(res.statusCode).toBe(200);
    const logOutput = chunks.join("");
    // Positive control: the requestId (an allow-listed `...Id` field) and
    // the literal "dynamic message:" prefix must survive - proving this
    // line was actually captured and sanitized, not silently dropped.
    expect(logOutput).toContain("dynamic message:");
    expect(logOutput).not.toContain(PII_SENTINEL);
    expect(logOutput).not.toContain("123-45-6789");
  });
});
