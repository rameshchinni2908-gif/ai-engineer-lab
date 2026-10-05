import type { VectorStore } from "@ail/shared";
import { InMemoryVectorStore } from "./in-memory.js";
import { QdrantStore, probeQdrantReachable } from "./qdrant.js";

export interface VectorStoreInfo {
  backend: "memory" | "qdrant";
  /** Set when `VECTOR_STORE=qdrant` was requested but Qdrant wasn't reachable, so the app degraded to memory. */
  degradedReason?: string;
}

let cachedStore: VectorStore | undefined;
let cachedInfo: VectorStoreInfo | undefined;
// Exposed for tests only, so each test file gets a clean singleton.
export function _resetVectorStoreForTests(): void {
  cachedStore = undefined;
  cachedInfo = undefined;
}

/**
 * Resolves (and memoizes) the `VectorStore` singleton per `VECTOR_STORE`
 * env (`memory` default | `qdrant`). If `qdrant` is requested but
 * unreachable, degrades to `InMemoryVectorStore` with a clear, logged
 * reason rather than crashing - per CLAUDE.md's "app MUST work with zero
 * setup" guarantee. The probe runs at most once per process (memoized).
 */
export async function getVectorStore(): Promise<VectorStore> {
  if (cachedStore) return cachedStore;
  const backend = (process.env.VECTOR_STORE ?? "memory").toLowerCase();

  if (backend === "qdrant") {
    const url = process.env.QDRANT_URL ?? "http://localhost:6333";
    const reachable = await probeQdrantReachable(url);
    if (reachable) {
      cachedStore = new QdrantStore(url);
      cachedInfo = { backend: "qdrant" };
      return cachedStore;
    }
    cachedInfo = {
      backend: "memory",
      degradedReason: `VECTOR_STORE=qdrant was set but ${url} is unreachable; degraded to the in-memory store.`,
    };
    cachedStore = new InMemoryVectorStore();
    return cachedStore;
  }

  cachedInfo = { backend: "memory" };
  cachedStore = new InMemoryVectorStore();
  return cachedStore;
}

/** Surfaces which backend is actually active (and why, if degraded) for `/health`-style diagnostics and the vector playground UI. */
export async function getVectorStoreInfo(): Promise<VectorStoreInfo> {
  if (!cachedInfo) await getVectorStore();
  return cachedInfo!;
}
