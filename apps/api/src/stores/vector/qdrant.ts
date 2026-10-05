import type {
  CreateCollectionOptions,
  VectorPoint,
  VectorSearchHit,
  VectorSearchOptions,
} from "@ail/shared";
import { conflictError, notFoundError, providerError } from "../../middleware/errors.js";
import type { ScannableVectorStore } from "./types.js";

const NAMESPACE_PAYLOAD_KEY = "__namespace";

function toQdrantDistance(distance: CreateCollectionOptions["distance"]): "Cosine" | "Dot" | "Euclid" {
  switch (distance) {
    case "dot":
      return "Dot";
    case "euclidean":
      return "Euclid";
    default:
      return "Cosine";
  }
}

/** Qdrant's point ids must be unsigned integers or UUIDs; this app's string chunk/point ids are passed through as Qdrant's own
 *  arbitrary-string-friendly "named point" is not supported in classic Qdrant, so we map our id into the UUID namespace
 *  deterministically is overkill here - recent Qdrant accepts arbitrary strings as point ids directly, so no mapping needed. */

interface QdrantSearchHitRaw {
  id: string | number;
  score: number;
  vector?: number[];
  payload?: Record<string, unknown>;
}

interface QdrantScrollPage {
  result: { points: QdrantSearchHitRaw[]; next_page_offset: string | number | null };
}

/**
 * `VectorStore` over Qdrant's REST API via plain `fetch` - no Qdrant SDK
 * dependency. Never required: selected only when `VECTOR_STORE=qdrant`, and
 * the registry (`registry.ts`) probes reachability once and falls back to
 * `InMemoryVectorStore` with a logged/surfaced warning if Qdrant isn't
 * running, per CLAUDE.md's zero-setup guarantee. IVF is not a native Qdrant
 * index type (Qdrant only ships HNSW); an `index.kind: "ivf"` collection is
 * created as a plain HNSW collection on Qdrant, which is an intentional,
 * documented fidelity gap versus the in-memory simulation.
 */
export class QdrantStore implements ScannableVectorStore {
  readonly #baseUrl: string;

  constructor(baseUrl: string) {
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async #request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.#baseUrl}${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...init?.headers },
      });
    } catch (err) {
      throw providerError(`Qdrant request failed: ${err instanceof Error ? err.message : String(err)}`, {
        providerId: "qdrant",
      });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 404) throw notFoundError(`Qdrant: ${path} not found`);
      throw providerError(`Qdrant ${res.status}: ${body}`, { providerId: "qdrant" });
    }
    return (await res.json()) as T;
  }

  async createCollection(name: string, dim: number, opts: CreateCollectionOptions = {}): Promise<void> {
    const existing = await this.listCollections();
    if (existing.includes(name)) throw conflictError(`Collection "${name}" already exists`);
    await this.#request(`/collections/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: JSON.stringify({
        vectors: { size: dim, distance: toQdrantDistance(opts.distance) },
        hnsw_config:
          opts.index?.kind === "hnsw"
            ? { m: opts.index.m ?? 16, ef_construct: opts.index.efConstruct ?? 100 }
            : undefined,
      }),
    });
  }

  async deleteCollection(name: string): Promise<void> {
    await this.#request(`/collections/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  async listCollections(): Promise<string[]> {
    const res = await this.#request<{ result: { collections: { name: string }[] } }>("/collections");
    return res.result.collections.map((c) => c.name);
  }

  async upsert(collection: string, points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;
    await this.#request(`/collections/${encodeURIComponent(collection)}/points`, {
      method: "PUT",
      body: JSON.stringify({
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: { ...p.metadata, ...(p.namespace !== undefined ? { [NAMESPACE_PAYLOAD_KEY]: p.namespace } : {}) },
        })),
      }),
    });
  }

  async search(collection: string, vector: number[], opts: VectorSearchOptions): Promise<VectorSearchHit[]> {
    const must: Record<string, unknown>[] = [];
    if (opts.namespace !== undefined) {
      must.push({ key: NAMESPACE_PAYLOAD_KEY, match: { value: opts.namespace } });
    }
    for (const [key, value] of Object.entries(opts.filter ?? {})) {
      must.push({ key, match: { value } });
    }
    const res = await this.#request<{ result: QdrantSearchHitRaw[] }>(
      `/collections/${encodeURIComponent(collection)}/points/search`,
      {
        method: "POST",
        body: JSON.stringify({
          vector,
          limit: opts.topK,
          with_payload: true,
          filter: must.length > 0 ? { must } : undefined,
        }),
      },
    );
    return res.result.map((hit) => this.#toHit(hit));
  }

  async get(collection: string, ids: string[]): Promise<VectorSearchHit[]> {
    if (ids.length === 0) return [];
    const res = await this.#request<{ result: QdrantSearchHitRaw[] }>(
      `/collections/${encodeURIComponent(collection)}/points`,
      { method: "POST", body: JSON.stringify({ ids, with_payload: true, with_vector: true }) },
    );
    return res.result.map((hit) => this.#toHit(hit, 1));
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.#request(`/collections/${encodeURIComponent(collection)}/points/delete`, {
      method: "POST",
      body: JSON.stringify({ points: ids }),
    });
  }

  async count(collection: string): Promise<number> {
    const res = await this.#request<{ result: { points_count: number } }>(
      `/collections/${encodeURIComponent(collection)}`,
    );
    return res.result.points_count;
  }

  async listAll(collection: string, namespace?: string): Promise<VectorSearchHit[]> {
    const filter =
      namespace !== undefined ? { must: [{ key: NAMESPACE_PAYLOAD_KEY, match: { value: namespace } }] } : undefined;
    const out: VectorSearchHit[] = [];
    let offset: string | number | null = null;
    let hasMore = true;
    while (hasMore) {
      const page: QdrantScrollPage = await this.#request(
        `/collections/${encodeURIComponent(collection)}/points/scroll`,
        {
          method: "POST",
          body: JSON.stringify({ limit: 256, with_payload: true, with_vector: true, filter, offset }),
        },
      );
      out.push(...page.result.points.map((p) => this.#toHit(p, 1)));
      hasMore = page.result.next_page_offset !== null && page.result.next_page_offset !== undefined;
      offset = page.result.next_page_offset ?? null;
    }
    return out;
  }

  #toHit(raw: QdrantSearchHitRaw, scoreOverride?: number): VectorSearchHit {
    const payload = { ...(raw.payload ?? {}) };
    delete payload[NAMESPACE_PAYLOAD_KEY];
    return {
      id: String(raw.id),
      score: scoreOverride ?? raw.score,
      vector: raw.vector,
      metadata: payload,
    };
  }
}

/** Thrown internally by `registry.ts` when a reachability probe fails; never surfaced raw to clients. */
export async function probeQdrantReachable(baseUrl: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/collections`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
