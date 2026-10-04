import type { FastifyPluginAsync } from "fastify";
import { getDb, getDriverName } from "../../db/index.js";
import { PROVIDER_IDS, isProviderConfigured } from "../../providers/registry.js";

/**
 * `GET /api/health`. Reports provider *configuration* booleans only - never
 * key values (CLAUDE.md: keys never leave the server, never logged, and
 * certainly never echoed in a response body).
 */
const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    const db = await getDb();
    let dbOk = true;
    try {
      db.prepare("SELECT 1").get();
    } catch {
      dbOk = false;
    }

    const configured = Object.fromEntries(
      PROVIDER_IDS.map((id) => [id, isProviderConfigured(id)]),
    );

    return {
      ok: dbOk,
      mode: process.env.LLM_PROVIDER ?? "mock",
      providers: { configured },
      db: { ok: dbOk, driver: getDriverName() },
    };
  });
};

export default healthRoutes;
