import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { getDb, getDriverName } from "./db/index.js";

export interface BuildAppOptions {
  logger?: boolean;
}

/**
 * Builds (but does not start) the Fastify app. Kept separate from server.ts
 * so tests can `buildApp().inject(...)` without binding a port.
 *
 * Layering convention for everything added in later waves: routes -> services
 * -> providers/stores. Routes must stay thin (parse request, call a service,
 * shape the response) - no business logic in route handlers. See
 * docs/architecture-layering.md.
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: process.env.LOG_LEVEL ?? "info",
            redact: {
              // Never log raw prompts/PII-bearing fields or secrets.
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "*.apiKey",
                "*.messages",
                "*.prompt",
                "*.piiFields",
              ],
              censor: "[redacted]",
            },
          },
    genReqId: () => randomUUID(),
  });

  await app.register(cors, {
    origin: true,
  });

  // Ensure the DB is open + migrated before serving traffic, so /health can
  // honestly report readiness and later route/service agents never race the
  // migration on first request.
  const db = await getDb();

  app.get("/health", async () => {
    let dbOk = true;
    try {
      db.prepare("SELECT 1").get();
    } catch {
      dbOk = false;
    }
    return {
      ok: dbOk,
      mode: process.env.LLM_PROVIDER ?? "mock",
      providers: {
        configured: {
          anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
          openai: Boolean(process.env.OPENAI_API_KEY),
          ollama: true,
          mock: true,
        },
      },
      db: {
        ok: dbOk,
        driver: getDriverName(),
      },
    };
  });

  return app;
}
