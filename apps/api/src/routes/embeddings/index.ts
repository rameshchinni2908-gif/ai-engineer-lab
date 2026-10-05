import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ChunkConfigSchema, ProviderIdSchema } from "@ail/shared";
import { parseBody } from "../../plugins/validation.js";
import { unprocessableError } from "../../middleware/errors.js";
import { computeSimilarity, projectPCA2D, chunkText, embedTexts } from "../../services/embeddings/index.js";

const EmbedBodySchema = z.object({
  texts: z.array(z.string()).min(1),
  providerId: ProviderIdSchema,
  model: z.string(),
});

const Project2dBodySchema = z.object({
  embeddings: z.array(z.array(z.number())).min(1),
  method: z.enum(["pca", "umap"]),
});

const SimilarityBodySchema = z.object({
  a: z.array(z.number()).min(1),
  b: z.array(z.number()).min(1),
  metric: z.enum(["cosine", "dot", "euclidean"]),
});

const ChunkPreviewBodySchema = z.object({
  text: z.string(),
  config: ChunkConfigSchema,
});

/** M4 embeddings routes (contracts.md §4): embed, 2D projection, similarity metrics, chunk-preview. */
const embeddingsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/embed", async (req) => {
    const { texts, providerId, model } = parseBody(EmbedBodySchema, req);
    // Routed through `embedTexts` (never `getProvider(...).embed()` directly
    // from a route) so this records a Run per contracts.md §2.3 - `embed()`
    // is an `LLMProvider` method just like `generate()`/`stream()`. The
    // response additively carries `runId` so the frontend can wire
    // `activeRunId` and get a real "Why this happened" explanation.
    const { embeddings, dim, run } = await embedTexts({
      texts,
      providerId,
      model,
      moduleId: "embeddings",
      feature: "embed",
    });
    return { embeddings, model, dim, runId: run.id };
  });

  app.post("/project-2d", async (req) => {
    const { embeddings, method } = parseBody(Project2dBodySchema, req);
    try {
      const points = projectPCA2D(embeddings);
      if (method === "umap") {
        // No full UMAP implementation in this teaching app (stochastic graph
        // layout is out of scope) - fall back to PCA with an explicit,
        // UI-surfaced disclosure rather than silently mislabeling it.
        return { points, note: "UMAP is not implemented; this projection is a PCA approximation." };
      }
      return { points };
    } catch (err) {
      throw unprocessableError(err instanceof Error ? err.message : "Invalid embeddings for projection");
    }
  });

  app.post("/similarity", async (req) => {
    const { a, b, metric } = parseBody(SimilarityBodySchema, req);
    try {
      return { score: computeSimilarity(a, b, metric) };
    } catch (err) {
      throw unprocessableError(err instanceof Error ? err.message : "Invalid vectors for similarity");
    }
  });

  app.post("/chunk-preview", async (req) => {
    const { text, config } = parseBody(ChunkPreviewBodySchema, req);
    try {
      return { chunks: chunkText("preview", text, config) };
    } catch (err) {
      throw unprocessableError(err instanceof Error ? err.message : "Invalid chunk config");
    }
  });
};

export default embeddingsRoutes;
