import type { RetrievalResult } from "@ail/shared";
import { getChunks } from "../../stores/rag/documents.js";
import { splitSentences } from "../embeddings/segment.js";

const TOKEN_RE = /[a-z0-9]+/g;

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().match(TOKEN_RE) ?? []);
}

/**
 * Parent-document retrieval: each result's precise, small-chunk match is
 * decoupled from what actually gets handed to the generator - the chunk's
 * immediate neighbours (by `index` within the same document) are stitched
 * in as surrounding "parent" context, so the model sees enough context to
 * answer fully while retrieval still matched on a precise small unit.
 */
export async function expandToParentContext(results: RetrievalResult[]): Promise<RetrievalResult[]> {
  const byDoc = new Map<string, RetrievalResult[]>();
  for (const r of results) {
    const list = byDoc.get(r.documentId) ?? [];
    list.push(r);
    byDoc.set(r.documentId, list);
  }

  const out: RetrievalResult[] = [];
  for (const [documentId, docResults] of byDoc) {
    const allChunks = documentId ? await getChunks(documentId) : [];
    const byId = new Map(allChunks.map((c) => [c.id, c]));
    for (const r of docResults) {
      const chunk = byId.get(r.chunkId);
      if (!chunk) {
        out.push(r);
        continue;
      }
      const prev = allChunks.find((c) => c.index === chunk.index - 1);
      const next = allChunks.find((c) => c.index === chunk.index + 1);
      const expandedText = [prev?.text, chunk.text, next?.text].filter(Boolean).join(" ");
      out.push({
        ...r,
        text: expandedText,
        metadata: {
          ...r.metadata,
          parentExpanded: true,
          includedChunkIds: [prev?.id, chunk.id, next?.id].filter((id): id is string => Boolean(id)),
        },
      });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

/**
 * Contextual compression via EXTRACTIVE sentence filtering (deterministic,
 * no extra LLM call): keeps only the sentences within each retrieved chunk
 * that lexically overlap the query, dropping roughly half the least-relevant
 * sentences. This is a simplified, legible stand-in for an LLM-based
 * compressor - deterministic and free, at the cost of being purely lexical
 * rather than semantic.
 */
export function compressResults(results: RetrievalResult[], query: string): RetrievalResult[] {
  const queryTerms = tokenize(query);
  return results.map((r) => {
    const sentences = splitSentences(r.text)
      .map((s) => s.text.trim())
      .filter(Boolean);
    if (sentences.length <= 2 || queryTerms.size === 0) return r;

    const scored = sentences.map((s) => {
      const terms = tokenize(s);
      let common = 0;
      for (const t of queryTerms) if (terms.has(t)) common++;
      return { sentence: s, score: common / queryTerms.size };
    });
    const keepCount = Math.max(1, Math.ceil(sentences.length / 2));
    const kept = new Set([...scored].sort((a, b) => b.score - a.score).slice(0, keepCount).map((s) => s.sentence));
    const compressedText = sentences.filter((s) => kept.has(s)).join(" ");

    return {
      ...r,
      text: compressedText,
      metadata: { ...r.metadata, compressedFromChars: r.text.length, compressedToChars: compressedText.length },
    };
  });
}
