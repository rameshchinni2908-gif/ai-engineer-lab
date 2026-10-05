import type { VectorSearchHit } from "@ail/shared";
import { cosineSimilarity, embedText } from "../embedding.js";

/** Long-term memory: persisted-across-steps conclusions, backed by a (local, deterministic) vector embedding - the same pattern the `vector_search` tool uses. */
export interface LongTermEntry {
  id: string;
  text: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

export class LongTermMemory {
  #entries: LongTermEntry[] = [];

  write(id: string, text: string, metadata: Record<string, unknown> = {}): void {
    this.#entries.push({ id, text, vector: embedText(text), metadata: { text, ...metadata } });
  }

  search(query: string, topK = 3): VectorSearchHit[] {
    const qVec = embedText(query);
    return this.#entries
      .map((e) => ({ id: e.id, score: cosineSimilarity(qVec, e.vector), metadata: e.metadata }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /** All stored entries, ranked by recency (used by the memory inspector when no specific query is given). */
  allByRecency(): VectorSearchHit[] {
    return [...this.#entries]
      .reverse()
      .map((e, i, arr) => ({ id: e.id, score: 1 - i / Math.max(arr.length, 1), metadata: e.metadata }));
  }
}
