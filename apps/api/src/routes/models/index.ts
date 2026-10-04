import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { MODEL_CATALOG, ProviderIdSchema, type ModelInfo } from "@ail/shared";
import { parseQuery } from "../../plugins/validation.js";
import { getProvider } from "../../providers/registry.js";

const QuerySchema = z.object({ providerId: ProviderIdSchema.optional() });

/**
 * `GET /api/models` - `MODEL_CATALOG` plus a live Ollama probe (if
 * `OLLAMA_BASE_URL` is reachable), deduped by `id`, per contracts §3.
 */
const modelsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/models", async (req) => {
    const { providerId } = parseQuery(QuerySchema, req);

    let models: ModelInfo[] = MODEL_CATALOG;
    if (!providerId || providerId === "ollama") {
      try {
        const ollamaModels = await getProvider("ollama").listModels();
        const seen = new Set(models.map((m) => m.id));
        models = [...models, ...ollamaModels.filter((m) => !seen.has(m.id))];
      } catch {
        // Ollama unreachable - fall back to the static catalog entries only.
      }
    }

    if (providerId) {
      models = models.filter((m) => m.providerId === providerId);
    }
    return { models };
  });
};

export default modelsRoutes;
