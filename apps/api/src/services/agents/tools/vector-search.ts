import type { ToolDefinition } from "@ail/shared";
import { cosineSimilarity, embedText } from "../embedding.js";
import { fail, ok, type ToolExecOutcome } from "./types.js";

export const vectorSearchDefinition: ToolDefinition = {
  name: "vector_search",
  description: "Semantic search over a small local document set using cosine similarity on deterministic hash embeddings.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" }, topK: { type: "number" } },
    required: ["query"],
  },
  category: "retrieval",
};

/**
 * Local fallback corpus used when the retrieval module's own `VectorStore`
 * isn't reachable (see the guarded dynamic import below). This agent owns
 * none of `retrieval-engineer`'s files; this fallback keeps `vector_search`
 * fully functional on its own rather than hard-depending on another
 * module's not-yet-existing service.
 */
const LOCAL_CORPUS = [
  { id: "doc_1", text: "RAG pipelines retrieve relevant chunks before generation to ground answers in real documents." },
  { id: "doc_2", text: "Chunking strategy and overlap size materially affect retrieval recall and precision." },
  { id: "doc_3", text: "Reciprocal rank fusion combines BM25 and vector search rankings into a single ranked list." },
  { id: "doc_4", text: "Reranking a small candidate set with a cross-encoder usually improves precision over vector search alone." },
  { id: "doc_5", text: "An agent's vector-backed long-term memory stores prior conclusions as embedded text for later retrieval." },
];
const LOCAL_EMBEDDINGS = LOCAL_CORPUS.map((d) => ({ ...d, vector: embedText(d.text) }));

interface MinimalSearchHit {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Attempts to reach `retrieval-engineer`'s vector-store service via a
 * runtime (non-statically-resolved) dynamic import so a missing module
 * never breaks the typecheck/build - mirrors the "guarded dynamic import"
 * pattern already used by `routes/index.ts` for module registration.
 * Report any real coupling need to the orchestrator rather than reaching
 * into that module's files directly (ownership, docs/contracts.md §5).
 */
async function tryRemoteSearch(query: string, topK: number): Promise<MinimalSearchHit[] | undefined> {
  try {
    // Built from parts at runtime so TS/bundlers never try to statically
    // resolve a path this agent does not own and cannot guarantee exists.
    const modPath = ["..", "..", "vector", "index.js"].join("/");
    const mod = (await import(modPath)) as {
      searchDefaultCollection?: (q: string, topK: number) => Promise<MinimalSearchHit[]>;
    };
    if (typeof mod.searchDefaultCollection === "function") {
      return await mod.searchDefaultCollection(query, topK);
    }
    return undefined;
  } catch {
    return undefined; // module not present yet in this wave, or no matching export - fall back silently
  }
}

function localSearch(query: string, topK: number): MinimalSearchHit[] {
  const qVec = embedText(query);
  return LOCAL_EMBEDDINGS.map((d) => ({ id: d.id, score: cosineSimilarity(qVec, d.vector), metadata: { text: d.text } }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function runVectorSearch(args: unknown): Promise<ToolExecOutcome> {
  const a = args as { query?: unknown; topK?: unknown };
  if (typeof a?.query !== "string" || a.query.trim().length === 0) {
    return fail("vector_search: missing required string argument 'query'");
  }
  const topK = typeof a.topK === "number" && a.topK > 0 ? Math.floor(a.topK) : 3;

  const remote = await tryRemoteSearch(a.query, topK);
  const hits = remote ?? localSearch(a.query, topK);
  return ok(JSON.stringify({ query: a.query, source: remote ? "retrieval-module" : "local-mock", hits }));
}
