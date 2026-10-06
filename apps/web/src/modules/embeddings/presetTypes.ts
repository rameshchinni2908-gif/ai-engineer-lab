import type { ChunkStrategy } from "@ail/shared";

/**
 * Flat, shared preset-param shape for the whole M4 page - each sub-component
 * reads only the fields it owns. One shared type (rather than one per child)
 * avoids any assignability friction when `index.tsx` passes the SAME applied
 * object down to several children at once.
 *
 * Every consumer MUST check `!== undefined`, never truthiness - fields like
 * `chunkOverlap: 0` or `efSearch: 0` are valid, meaningful preset values that
 * a truthiness check would silently skip.
 */
export interface EmbeddingsPresetParams {
  /** Which playground/experiments section to scroll into view on selection. */
  section?: "similarity" | "chunking" | "index-tradeoffs" | "hybrid";
  // ChunkingLab
  chunkStrategy?: ChunkStrategy;
  chunkSize?: number;
  chunkOverlap?: number;
  // SimilarityLab
  simQuery?: string;
  simCandidates?: string[];
  // IndexTradeoffs
  efSearch?: number;
  nprobe?: number;
  // HybridAndRerank
  hybridQuery?: string;
  hybridTopK?: number;
}
