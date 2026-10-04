export type IndexKind = "flat" | "hnsw" | "ivf";

export interface IndexConfig {
  kind: IndexKind;
  /** HNSW: number of bi-directional links per node. */
  m?: number;
  /** HNSW: candidate list size during index construction. */
  efConstruct?: number;
  /** HNSW: candidate list size during search. */
  efSearch?: number;
  /** IVF: number of inverted-file clusters. */
  nlist?: number;
  /** IVF: number of clusters probed at search time. */
  nprobe?: number;
}

export interface VectorPoint {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
  namespace?: string;
}

/** Simple equality/range filter over point metadata. */
export type VectorFilter = Record<string, unknown>;

export interface VectorSearchOptions {
  topK: number;
  filter?: VectorFilter;
  namespace?: string;
}

export interface VectorSearchHit {
  id: string;
  score: number;
  vector?: number[];
  metadata: Record<string, unknown>;
}

export interface CreateCollectionOptions {
  index?: IndexConfig;
  distance?: "cosine" | "dot" | "euclidean";
}

/**
 * Uniform interface implemented by every vector backend (Qdrant and the
 * zero-setup InMemoryStore default). RAG/Embeddings modules depend only on this.
 */
export interface VectorStore {
  createCollection(name: string, dim: number, opts?: CreateCollectionOptions): Promise<void>;
  deleteCollection(name: string): Promise<void>;
  listCollections(): Promise<string[]>;
  upsert(collection: string, points: VectorPoint[]): Promise<void>;
  search(collection: string, vector: number[], opts: VectorSearchOptions): Promise<VectorSearchHit[]>;
  get(collection: string, ids: string[]): Promise<VectorSearchHit[]>;
  delete(collection: string, ids: string[]): Promise<void>;
  count(collection: string): Promise<number>;
}
