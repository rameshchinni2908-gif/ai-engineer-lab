import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { getDb } from "./db/index.js";
import { registerErrorHandler } from "./middleware/error-handler.js";
import { registerRateLimit } from "./plugins/rate-limit.js";
import { buildLoggerOptions, genReqId } from "./plugins/logger.js";
import healthRoutes from "./routes/health/index.js";
import modelsRoutes from "./routes/models/index.js";
import providersRoutes from "./routes/providers/index.js";
import runsRoutes from "./routes/runs/index.js";
import tracesRoutes from "./routes/traces/index.js";
import explainRoutes from "./routes/explain/index.js";
import { registerModuleRoutes } from "./routes/index.js";

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
    logger: opts.logger === false ? false : buildLoggerOptions(),
    genReqId,
  });

  await app.register(cors, {
    // Scoped to the configured web origin (default: the Vite dev server) -
    // never reflects an arbitrary origin.
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  });

  await registerRateLimit(app);
  registerErrorHandler(app);

  // Echo x-request-id on EVERY response (success or error, SSE or not),
  // set before the first byte per contracts §1/§2.1. SSE routes hijack the
  // raw response themselves and set this same header directly in
  // `plugins/sse.ts`, so this hook only needs to cover the normal JSON path.
  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("x-request-id", String(req.id));
    return payload;
  });

  // Ensure the DB is open + migrated before serving traffic, so /health can
  // honestly report readiness and later route/service agents never race the
  // migration on first request.
  await getDb();

  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(modelsRoutes, { prefix: "/api" });
  await app.register(providersRoutes, { prefix: "/api" });
  await app.register(runsRoutes, { prefix: "/api" });
  await app.register(tracesRoutes, { prefix: "/api" });
  await app.register(explainRoutes, { prefix: "/api" });

  await registerModuleRoutes(app);

  return app;
}
