import type { VectorStore, VectorSearchHit } from "@ail/shared";

/**
 * Internal extension both of this app's `VectorStore` implementations
 * support, beyond the shared interface: enumerating every point in a
 * collection (optionally scoped to a namespace). This powers hybrid search's
 * BM25 corpus construction (which needs the raw text of every indexed point,
 * not just nearest-neighbour results) and the namespace-isolation demo. It
 * is NOT part of `@ail/shared`'s `VectorStore` contract - callers that only
 * have a `VectorStore`-typed reference must narrow via `isScannable()`.
 */
export interface ScannableVectorStore extends VectorStore {
  listAll(collection: string, namespace?: string): Promise<VectorSearchHit[]>;
}

export function isScannable(store: VectorStore): store is ScannableVectorStore {
  return typeof (store as Partial<ScannableVectorStore>).listAll === "function";
}
