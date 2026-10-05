import type {
  Chunk,
  ChunkConfig,
  CreateCollectionOptions,
  ProviderId,
  RetrievalResult,
  RetrievalDebug,
  VectorFilter,
  VectorPoint,
  VectorSearchHit,
} from "@ail/shared";
import { apiFetch } from "@/lib/api";

/** Typed fetchers for every M4 (`/embeddings`, `/vector`) route - contracts.md §4. */
export const embeddingsApi = {
  embed: (
    texts: string[],
    providerId: ProviderId,
    model: string,
  ): Promise<{ embeddings: number[][]; model: string; dim: number; runId: string }> =>
    apiFetch("/embeddings/embed", { method: "POST", body: { texts, providerId, model } }),

  project2d: (embeddings: number[][], method: "pca" | "umap"): Promise<{ points: { x: number; y: number }[]; note?: string }> =>
    apiFetch("/embeddings/project-2d", { method: "POST", body: { embeddings, method } }),

  similarity: (a: number[], b: number[], metric: "cosine" | "dot" | "euclidean"): Promise<{ score: number }> =>
    apiFetch("/embeddings/similarity", { method: "POST", body: { a, b, metric } }),

  chunkPreview: (text: string, config: ChunkConfig): Promise<{ chunks: Chunk[] }> =>
    apiFetch("/embeddings/chunk-preview", { method: "POST", body: { text, config } }),

  listCollections: (): Promise<{ collections: string[] }> => apiFetch("/vector/collections"),

  createCollection: (name: string, dim: number, opts?: CreateCollectionOptions): Promise<{ ok: true }> =>
    apiFetch("/vector/collections", { method: "POST", body: { name, dim, opts } }),

  deleteCollection: (name: string): Promise<{ ok: true }> =>
    apiFetch(`/vector/collections/${encodeURIComponent(name)}`, { method: "DELETE" }),

  count: (name: string): Promise<{ count: number }> => apiFetch(`/vector/collections/${encodeURIComponent(name)}/count`),

  upsert: (name: string, points: VectorPoint[]): Promise<{ upserted: number }> =>
    apiFetch(`/vector/collections/${encodeURIComponent(name)}/upsert`, { method: "POST", body: { points } }),

  search: (
    name: string,
    vector: number[],
    opts: { topK: number; filter?: VectorFilter; namespace?: string },
  ): Promise<{ hits: VectorSearchHit[] }> =>
    apiFetch(`/vector/collections/${encodeURIComponent(name)}/search`, { method: "POST", body: { vector, ...opts } }),

  deletePoints: (name: string, ids: string[]): Promise<{ deleted: number }> =>
    apiFetch(`/vector/collections/${encodeURIComponent(name)}/delete`, { method: "POST", body: { ids } }),

  hybridSearch: (
    collection: string,
    query: string,
    topK: number,
    providerId: ProviderId,
    model: string,
    rrfK?: number,
  ): Promise<{ results: RetrievalResult[]; debug: RetrievalDebug; runId: string }> =>
    apiFetch("/vector/hybrid-search", { method: "POST", body: { collection, query, topK, providerId, model, rrfK } }),

  rerank: (query: string, candidates: RetrievalResult[]): Promise<{ before: RetrievalResult[]; after: RetrievalResult[] }> =>
    apiFetch("/vector/rerank", { method: "POST", body: { query, candidates } }),
};
