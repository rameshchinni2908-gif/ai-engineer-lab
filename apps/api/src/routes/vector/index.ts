import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ProviderIdSchema, RetrievalResultSchema } from "@ail/shared";
import { parseBody, parseParams } from "../../plugins/validation.js";
import { getVectorStore } from "../../stores/vector/registry.js";
import { hybridSearch } from "../../services/vector/hybrid.js";
import { rerankCandidates } from "../../services/vector/rerank.js";

const IndexConfigSchema = z.object({
  kind: z.enum(["flat", "hnsw", "ivf"]),
  m: z.number().int().positive().optional(),
  efConstruct: z.number().int().positive().optional(),
  efSearch: z.number().int().positive().optional(),
  nlist: z.number().int().positive().optional(),
  nprobe: z.number().int().positive().optional(),
});

const CreateCollectionOptionsSchema = z.object({
  index: IndexConfigSchema.optional(),
  distance: z.enum(["cosine", "dot", "euclidean"]).optional(),
});

const CreateCollectionBodySchema = z.object({
  name: z.string().min(1),
  dim: z.number().int().positive(),
  opts: CreateCollectionOptionsSchema.optional(),
});

const VectorPointSchema = z.object({
  id: z.string(),
  vector: z.array(z.number()),
  metadata: z.record(z.string(), z.unknown()),
  namespace: z.string().optional(),
});

const UpsertBodySchema = z.object({ points: z.array(VectorPointSchema).min(1) });

const SearchBodySchema = z.object({
  vector: z.array(z.number()),
  topK: z.number().int().positive(),
  filter: z.record(z.string(), z.unknown()).optional(),
  namespace: z.string().optional(),
});

const DeleteBodySchema = z.object({ ids: z.array(z.string()).min(1) });

const NameParamsSchema = z.object({ name: z.string() });

const HybridSearchBodySchema = z.object({
  collection: z.string(),
  query: z.string(),
  topK: z.number().int().positive(),
  providerId: ProviderIdSchema,
  model: z.string(),
  rrfK: z.number().int().positive().optional(),
});

const RerankBodySchema = z.object({
  query: z.string(),
  candidates: z.array(RetrievalResultSchema),
});

/** M4 vector-store routes (contracts.md §4): collection CRUD, upsert/search/delete, hybrid search, rerank. */
const vectorRoutes: FastifyPluginAsync = async (app) => {
  app.get("/collections", async () => {
    const store = await getVectorStore();
    return { collections: await store.listCollections() };
  });

  app.post("/collections", async (req, reply) => {
    const { name, dim, opts } = parseBody(CreateCollectionBodySchema, req);
    const store = await getVectorStore();
    await store.createCollection(name, dim, opts);
    reply.header("location", `/api/vector/collections/${encodeURIComponent(name)}`);
    reply.code(201);
    return { ok: true };
  });

  app.delete("/collections/:name", async (req) => {
    const { name } = parseParams(NameParamsSchema, req);
    const store = await getVectorStore();
    await store.deleteCollection(name);
    return { ok: true };
  });

  app.get("/collections/:name/count", async (req) => {
    const { name } = parseParams(NameParamsSchema, req);
    const store = await getVectorStore();
    return { count: await store.count(name) };
  });

  app.post("/collections/:name/upsert", async (req) => {
    const { name } = parseParams(NameParamsSchema, req);
    const { points } = parseBody(UpsertBodySchema, req);
    const store = await getVectorStore();
    await store.upsert(name, points);
    return { upserted: points.length };
  });

  app.post("/collections/:name/search", async (req) => {
    const { name } = parseParams(NameParamsSchema, req);
    const { vector, topK, filter, namespace } = parseBody(SearchBodySchema, req);
    const store = await getVectorStore();
    const hits = await store.search(name, vector, { topK, filter, namespace });
    return { hits };
  });

  app.post("/collections/:name/delete", async (req) => {
    const { name } = parseParams(NameParamsSchema, req);
    const { ids } = parseBody(DeleteBodySchema, req);
    const store = await getVectorStore();
    const existing = await store.get(name, ids);
    await store.delete(name, ids);
    return { deleted: existing.length };
  });

  app.post("/hybrid-search", async (req) => {
    const body = parseBody(HybridSearchBodySchema, req);
    // `runId` is additive on top of the contract's `{ results, debug }`
    // shape - the embedding call inside `hybridSearch` now records a Run
    // (contracts.md §2.3), and the frontend wires this id to `activeRunId`.
    const { results, debug, runId } = await hybridSearch(body);
    return { results, debug, runId };
  });

  app.post("/rerank", async (req) => {
    const { query, candidates } = parseBody(RerankBodySchema, req);
    return rerankCandidates(query, candidates);
  });
};

export default vectorRoutes;
