import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";

/**
 * Per-IP rate limiting, applied globally to every route (CLAUDE.md:
 * non-negotiable). Limits/window come from env so ops can tune them per
 * deployment without a code change; every response gets the standard
 * `x-ratelimit-*` headers and 429s additionally get `retry-after`, both
 * provided by `@fastify/rate-limit` itself. The actual 429 -> `ApiErrorSchema`
 * body mapping happens in `middleware/error-handler.ts`, so this plugin does
 * not need a custom `errorResponseBuilder`.
 */
export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  const max = Number(process.env.RATE_LIMIT_MAX ?? 60);
  const timeWindow = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  await app.register(rateLimit, {
    max,
    timeWindow,
    global: true,
    keyGenerator: (req) => req.ip,
  });
}
