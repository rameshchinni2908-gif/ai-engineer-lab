import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { PassThrough } from "node:stream";
import pino from "pino";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-redaction.db");

const { getDb, closeDb } = await import("./db/index.js");
const { registerErrorHandler } = await import("./middleware/error-handler.js");
const { buildLoggerOptions, genReqId } = await import("./plugins/logger.js");

const PII_PROMPT = "My social security number is 123-45-6789 and my name is Jane Q. Public.";
const FAKE_API_KEY = "sk-live-SUPER_SECRET_DO_NOT_LOG_abcdef123456";

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
});
