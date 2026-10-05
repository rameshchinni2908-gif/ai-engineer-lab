import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ChunkConfigSchema, GenerationParamsSchema, ProviderIdSchema } from "@ail/shared";
import { parseBody, parseParams, parseQuery } from "../../plugins/validation.js";
import { openSseStream } from "../../plugins/sse.js";
import { ApiHttpError, notFoundError } from "../../middleware/errors.js";
import { getVectorStore } from "../../stores/vector/registry.js";
import {
  deleteChunksForDocument,
  deleteDocumentRow,
  getChunks,
  getDocument,
  listDocuments,
} from "../../stores/rag/documents.js";
import { chunkDocument, embedDocumentChunks, indexDocument, ingestDocument } from "../../services/rag/ingest.js";
import { retrieve, type RagStrategy } from "../../services/rag/retrieval.js";
import { generateAnswer } from "../../services/rag/answer.js";
import { runFailureModeDemo } from "../../services/rag/failure-modes.js";

// Documents are created via JSON only (not multipart) - the frontend reads
// the file client-side and sends `{ name, mimeType, text }`, where `text`
// for `application/pdf` is base64-encoded bytes (decoded server-side by
// `services/rag/parse.ts`) and plain decoded text for md/txt. This keeps
// the dependency surface small (no @fastify/multipart) while still
// supporting PDF/MD/TXT end to end; see `docs/contracts.md`'s "multipart OR
// JSON" alternative for the sanctioned non-multipart path.
const DocumentCreateBodySchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  text: z.string(),
});

const ListQuerySchema = z.object({
  page: z.coerce.number().int().nonnegative().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

const IdParamsSchema = z.object({ id: z.string() });

const ChunkBodySchema = z.object({ config: ChunkConfigSchema });

const EmbedBodySchema = z.object({ providerId: ProviderIdSchema, model: z.string() });

const IndexBodySchema = z.object({ collection: z.string().min(1) });

const STRATEGIES = ["basic", "query-rewrite", "hyde", "multi-query", "parent-doc", "compression", "agentic"] as const;

const QueryBodySchema = z.object({
  query: z.string().min(1),
  collection: z.string().min(1),
  strategy: z.enum(STRATEGIES).optional(),
  topK: z.number().int().positive(),
  providerId: ProviderIdSchema,
  model: z.string(),
  params: GenerationParamsSchema.optional(),
});

const FailureModeBodySchema = z.object({
  mode: z.enum(["miss", "ignored", "lost-in-middle", "stale"]),
  query: z.string().min(1),
  collection: z.string().min(1),
});

/** M5 RAG routes (contracts.md §4): document ingestion pipeline + query (SSE) + failure-mode lab. */
const ragRoutes: FastifyPluginAsync = async (app) => {
  app.post("/documents", async (req, reply) => {
    const body = parseBody(DocumentCreateBodySchema, req);
    const doc = await ingestDocument(body);
    reply.header("location", `/api/rag/documents/${doc.id}`);
    reply.code(201);
    return doc;
  });

  app.get("/documents", async (req) => {
    const q = parseQuery(ListQuerySchema, req);
    return listDocuments(q);
  });

  app.get("/documents/:id", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const doc = await getDocument(id);
    if (!doc) throw notFoundError(`Document ${id} not found`);
    return doc;
  });

  app.delete("/documents/:id", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const doc = await getDocument(id);
    if (!doc) throw notFoundError(`Document ${id} not found`);

    const chunks = await getChunks(id);
    const chunkIds = chunks.map((c) => c.id);
    const indexedCollections = (doc.metadata.indexedCollections as string[] | undefined) ?? [];
    if (chunkIds.length > 0 && indexedCollections.length > 0) {
      const store = await getVectorStore();
      for (const collection of indexedCollections) {
        try {
          await store.delete(collection, chunkIds);
        } catch {
          // Collection may have been deleted independently - deleting the
          // document should still succeed; this is best-effort cleanup.
        }
      }
    }
    await deleteChunksForDocument(id);
    await deleteDocumentRow(id);
    return { ok: true };
  });

  app.post("/documents/:id/chunk", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const { config } = parseBody(ChunkBodySchema, req);
    const chunks = await chunkDocument(id, config);
    return { chunks };
  });

  app.post("/documents/:id/embed", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const { providerId, model } = parseBody(EmbedBodySchema, req);
    const chunks = await embedDocumentChunks(id, providerId, model);
    return { chunks };
  });

  app.post("/documents/:id/index", async (req) => {
    const { id } = parseParams(IdParamsSchema, req);
    const { collection } = parseBody(IndexBodySchema, req);
    return indexDocument(id, collection);
  });

  app.post("/query", async (req, reply) => {
    const body = parseBody(QueryBodySchema, req);
    const requestId = String(req.id);
    const writer = openSseStream(reply, requestId);
    const runId = `run_${randomUUID()}`;
    const traceId = `trace_${randomUUID()}`;

    try {
      const { results } = await retrieve({
        query: body.query,
        collection: body.collection,
        topK: body.topK,
        providerId: body.providerId,
        model: body.model,
        strategy: (body.strategy ?? "basic") as RagStrategy,
        parentRunId: runId,
        traceId,
        onStage: (stage, data) => writer.send({ type: "stage", runId, stage, data }),
      });
      await generateAnswer({
        runId,
        query: body.query,
        results,
        providerId: body.providerId,
        model: body.model,
        params: body.params,
        traceId,
        writer,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof ApiHttpError ? err.code : "INTERNAL_ERROR";
      writer.send({ type: "error", runId, code, message });
    } finally {
      writer.send({ type: "done" });
      writer.close();
    }
  });

  app.post("/failure-mode-demo", async (req) => {
    const body = parseBody(FailureModeBodySchema, req);
    return runFailureModeDemo(body);
  });
};

export default ragRoutes;
