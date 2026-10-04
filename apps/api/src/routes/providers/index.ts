import type { FastifyPluginAsync } from "fastify";
import { PROVIDER_IDS, isProviderConfigured } from "../../providers/registry.js";

/** `GET /api/providers` - static per-provider availability (config presence, not a live health check). */
const providersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/providers", async () => {
    const providers = PROVIDER_IDS.map((id) => {
      const available = isProviderConfigured(id);
      return {
        id,
        available,
        reason: available
          ? undefined
          : `${id} requires ${id === "anthropic" ? "ANTHROPIC_API_KEY" : id === "openai" ? "OPENAI_API_KEY" : "configuration"} to be set.`,
      };
    });
    return { providers };
  });
};

export default providersRoutes;
