import { randomUUID } from "node:crypto";
import type { Chunk, ChunkConfig, Document, ProviderId } from "@ail/shared";
import { withSpan } from "../runs/index.js";
import { getProvider } from "../../providers/registry.js";
import { conflictError, notFoundError, unprocessableError } from "../../middleware/errors.js";
import { chunkText } from "../embeddings/index.js";
import { getVectorStore } from "../../stores/vector/registry.js";
import {
  getChunks,
  getDocument,
  insertDocument,
  replaceChunks,
  updateChunkEmbeddings,
  updateDocumentMetadata,
} from "../../stores/rag/documents.js";
import { parseDocumentInput } from "./parse.js";

export interface IngestDocumentArgs {
  name: string;
  mimeType: string;
  text: string;
  traceId?: string;
}

/** Upload -> parse stage (contracts §4 M5 `POST /rag/documents`). Degrades gracefully on a PDF parse failure (empty text + `metadata.parseWarning`) rather than rejecting the upload. */
export async function ingestDocument(args: IngestDocumentArgs): Promise<Document> {
  return withSpan(
    "rag.parse",
    "internal",
    { name: args.name, mimeType: args.mimeType },
    async () => {
      const parsed = await parseDocumentInput(args);
      const sizeBytes =
        args.mimeType === "application/pdf"
          ? Buffer.byteLength(args.text, "base64")
          : Buffer.byteLength(parsed.text, "utf8");
      return insertDocument({
        id: `doc_${randomUUID()}`,
        name: args.name,
        mimeType: args.mimeType,
        sizeBytes,
        text: parsed.text,
        metadata: parsed.warning ? { parseWarning: parsed.warning } : {},
      });
    },
    { traceId: args.traceId },
  );
}

/** Chunk stage (`POST /rag/documents/:id/chunk`): replaces any prior chunking for this document. */
export async function chunkDocument(documentId: string, config: ChunkConfig, traceId?: string): Promise<Chunk[]> {
  return withSpan(
    "rag.chunk",
    "internal",
    { documentId, strategy: config.strategy, chunkSize: config.chunkSize },
    async () => {
      const doc = await getDocument(documentId);
      if (!doc) throw notFoundError(`Document ${documentId} not found`);
      let chunks: Chunk[];
      try {
        chunks = chunkText(documentId, doc.text, config);
      } catch (err) {
        throw unprocessableError(err instanceof Error ? err.message : "Invalid chunk config");
      }
      await replaceChunks(documentId, chunks);
      return chunks;
    },
    { traceId },
  );
}

/** Embed stage (`POST /rag/documents/:id/embed`): requires `/chunk` to have already run. */
export async function embedDocumentChunks(
  documentId: string,
  providerId: ProviderId,
  model: string,
  traceId?: string,
): Promise<Chunk[]> {
  return withSpan(
    "rag.embed",
    "embedding",
    { documentId, providerId, model },
    async () => {
      const doc = await getDocument(documentId);
      if (!doc) throw notFoundError(`Document ${documentId} not found`);
      const chunks = await getChunks(documentId);
      if (chunks.length === 0) {
        throw conflictError(`No chunks exist for document ${documentId}; run /chunk first`);
      }
      const provider = getProvider(providerId);
      if (!provider.embed) {
        throw unprocessableError(`Provider "${providerId}" does not support embeddings`);
      }
      const vectors = await provider.embed(chunks.map((c) => c.text), model);
      const embedded = chunks.map((c, i) => ({ ...c, embedding: vectors[i] }));
      await updateChunkEmbeddings(embedded);
      return embedded;
    },
    { traceId },
  );
}

/** Index stage (`POST /rag/documents/:id/index`): upserts embedded chunks into the named `VectorStore` collection (creating it if absent). */
export async function indexDocument(
  documentId: string,
  collection: string,
  traceId?: string,
): Promise<{ ok: true; count: number }> {
  return withSpan(
    "rag.index",
    "retrieval",
    { documentId, collection },
    async () => {
      const doc = await getDocument(documentId);
      if (!doc) throw notFoundError(`Document ${documentId} not found`);
      const chunks = await getChunks(documentId);
      if (chunks.length === 0) throw conflictError(`Document ${documentId} has no chunks; run /chunk first`);
      const missing = chunks.find((c) => !c.embedding);
      if (missing) throw conflictError(`Chunk ${missing.id} has no embedding; run /embed first`);

      const store = await getVectorStore();
      const existingCollections = await store.listCollections();
      const dim = chunks[0]!.embedding!.length;
      if (!existingCollections.includes(collection)) {
        await store.createCollection(collection, dim);
      }
      await store.upsert(
        collection,
        chunks.map((c) => ({
          id: c.id,
          vector: c.embedding!,
          metadata: { chunkId: c.id, documentId, text: c.text, index: c.index, ...c.metadata },
        })),
      );

      const indexedCollections = new Set<string>([
        ...((doc.metadata.indexedCollections as string[] | undefined) ?? []),
        collection,
      ]);
      await updateDocumentMetadata(documentId, { ...doc.metadata, indexedCollections: [...indexedCollections] });

      return { ok: true as const, count: chunks.length };
    },
    { traceId },
  );
}
