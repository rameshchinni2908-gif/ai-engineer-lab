import type {
  CreateCollectionOptions,
  VectorFilter,
  VectorPoint,
  VectorSearchHit,
  VectorSearchOptions,
} from "@ail/shared";
import { conflictError, notFoundError, unprocessableError } from "../../middleware/errors.js";
import { computeSimilarity, isHigherBetter, type SimilarityMetric } from "../../services/embeddings/similarity.js";
import { matchesFilter } from "./filter.js";
import { annProfileFor, degradeRanking, delay } from "./ann-simulation.js";
import type { ScannableVectorStore } from "./types.js";

interface CollectionState {
  dim: number;
  opts: CreateCollectionOptions;
  points: Map<string, VectorPoint>;
}

/**
 * Zero-setup default `VectorStore`: a pure in-process Map-backed store.
 * Exact (Flat) search by default; when a collection is created with a
 * non-flat `IndexConfig`, `search()` deterministically simulates HNSW/IVF
 * recall-vs-latency trade-offs (see `ann-simulation.ts`) - never a real ANN
 * index, always clearly documented as a teaching simulation.
 */
export class InMemoryVectorStore implements ScannableVectorStore {
  #collections = new Map<string, CollectionState>();

  async createCollection(name: string, dim: number, opts: CreateCollectionOptions = {}): Promise<void> {
    if (this.#collections.has(name)) {
      throw conflictError(`Collection "${name}" already exists`);
    }
    this.#collections.set(name, { dim, opts, points: new Map() });
  }

  async deleteCollection(name: string): Promise<void> {
    this.#collections.delete(name);
  }

  async listCollections(): Promise<string[]> {
    return [...this.#collections.keys()];
  }

  #requireCollection(name: string): CollectionState {
    const state = this.#collections.get(name);
    if (!state) throw notFoundError(`Collection "${name}" not found`);
    return state;
  }

  async upsert(collection: string, points: VectorPoint[]): Promise<void> {
    const state = this.#requireCollection(collection);
    for (const point of points) {
      if (point.vector.length !== state.dim) {
        throw unprocessableError(
          `Point "${point.id}" has dimension ${point.vector.length}, collection "${collection}" expects ${state.dim}`,
        );
      }
      state.points.set(point.id, point);
    }
  }

  async search(collection: string, vector: number[], opts: VectorSearchOptions): Promise<VectorSearchHit[]> {
    const state = this.#requireCollection(collection);
    if (vector.length !== state.dim) {
      throw unprocessableError(`Query vector has dimension ${vector.length}, collection "${collection}" expects ${state.dim}`);
    }
    const metric: SimilarityMetric = (state.opts.distance as SimilarityMetric | undefined) ?? "cosine";
    const higherIsBetter = isHigherBetter(metric);

    const candidates = this.#filterPoints(state, opts.namespace, opts.filter);
    const scored: VectorSearchHit[] = candidates.map((p) => ({
      id: p.id,
      score: computeSimilarity(vector, p.vector, metric),
      metadata: p.metadata,
    }));
    scored.sort((a, b) => (higherIsBetter ? b.score - a.score : a.score - b.score));

    const profile = annProfileFor(state.opts.index);
    if (profile.latencyMs > 0) await delay(profile.latencyMs);

    const pool = scored.slice(0, Math.max(opts.topK * 3, 50));
    return degradeRanking(pool, opts.topK, profile.recallFactor, higherIsBetter);
  }

  async get(collection: string, ids: string[]): Promise<VectorSearchHit[]> {
    const state = this.#requireCollection(collection);
    const hits: VectorSearchHit[] = [];
    for (const id of ids) {
      const point = state.points.get(id);
      if (point) hits.push({ id: point.id, score: 1, vector: point.vector, metadata: point.metadata });
    }
    return hits;
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    const state = this.#requireCollection(collection);
    for (const id of ids) state.points.delete(id);
  }

  async count(collection: string): Promise<number> {
    const state = this.#requireCollection(collection);
    return state.points.size;
  }

  async listAll(collection: string, namespace?: string): Promise<VectorSearchHit[]> {
    const state = this.#requireCollection(collection);
    return this.#filterPoints(state, namespace, undefined).map((p) => ({
      id: p.id,
      score: 1,
      vector: p.vector,
      metadata: p.metadata,
    }));
  }

  #filterPoints(state: CollectionState, namespace: string | undefined, filter: VectorFilter | undefined): VectorPoint[] {
    const out: VectorPoint[] = [];
    for (const point of state.points.values()) {
      if (namespace !== undefined && point.namespace !== namespace) continue;
      if (!matchesFilter(point.metadata, filter)) continue;
      out.push(point);
    }
    return out;
  }
}
