import type { ModuleContent } from "../types";

export const embeddingsContent: ModuleContent = {
  moduleId: "embeddings",
  learn: {
    moduleId: "embeddings",
    summary: {
      beginner:
        "An embedding turns text into a list of numbers that captures its meaning, so a computer can measure how similar two pieces of text are. Vector databases store millions of these and find the closest matches fast.",
      intermediate:
        "Similarity metrics (cosine, dot, euclidean), index structures (Flat/HNSW/IVF), and hybrid search (BM25 + vector, fused via RRF) each trade accuracy, speed, and memory differently — and reranking adds a second, more expensive pass to fix what cheap retrieval gets wrong.",
      senior:
        "Embedding models are not interchangeable — mixing vector spaces across model versions silently corrupts similarity search with no error thrown. ANN indexes (HNSW/IVF) trade recall for speed via tunable parameters that must be measured against your actual corpus and query distribution, not left at defaults.",
    },
    explain: [
      {
        heading: "Embeddings put meaning into coordinates",
        body: "An embedding model converts text into a fixed-length vector such that semantically similar texts land close together in that vector space. Once everything is a vector, 'how similar are these two things' becomes a geometry question — a distance or angle calculation — rather than a string-comparison problem.",
      },
      {
        heading: "Flat, HNSW, and IVF trade accuracy for speed differently",
        body: "A Flat index checks every vector exactly (perfect recall, slow at scale). HNSW builds a navigable graph for fast approximate search with good recall but more memory. IVF clusters vectors first and searches only the nearest clusters, using less memory but requiring a training step. None is strictly 'better' — the right choice depends on corpus size, update frequency, and your recall/latency target.",
      },
      {
        heading: "BM25 and vector search fail on different queries, which is why hybrid search wins",
        body: "BM25 (keyword-based) excels at exact terms — product codes, rare names — that embeddings can blur past in favor of semantic similarity. Vector search excels at paraphrases and synonyms that BM25 can't match lexically. Running both and fusing results (typically with Reciprocal Rank Fusion) covers more real queries than either alone.",
      },
    ],
    underTheHood: [
      {
        heading: "The mock embedder is deterministic by contract",
        body: "`MockProvider.embed()` must be a seeded hash-to-vector function — same text, same vector, every time, with zero API keys. This is what makes chunking, similarity, projection, and retrieval demos reproducible in this app without any provider configured; it is not meant to carry real semantic meaning, only to behave consistently.",
      },
      {
        heading: "Reranking is a second, more expensive pass over a small candidate set",
        body: "`/vector/rerank` takes the candidates a cheap retriever already narrowed down and rescales them with a more accurate (and much more expensive per-pair) cross-encoder-style model. This two-stage pattern — cheap broad retrieval, then expensive precise reranking on a small set — is what makes high-quality retrieval affordable at all.",
      },
      {
        heading: "Hybrid search exposes its own staged debug trail",
        body: "`/vector/hybrid-search`'s response includes `debug.stages` with one entry each for `bm25`, `vector`, and `fusion` — so you can see exactly what each retriever found independently before fusion, and verify the fused ranking actually reflects both signals rather than one dominating silently.",
      },
    ],
    seniorGotchas: [
      {
        heading: "Switching embedding models invalidates your entire index, silently",
        body: "Vectors from two different embedding models (or even different versions of the same model) are not comparable — there's no error thrown if you mix them, just quietly wrong similarity scores. Any embedding model change requires re-embedding the full corpus, not an incremental patch.",
      },
      {
        heading: "The wrong distance metric degrades quality without any error",
        body: "Using Euclidean distance against embeddings trained/normalized for cosine similarity (or vice versa) produces a plausible-looking but subtly wrong ranking — nothing crashes, retrieval just quietly gets worse. Always use the metric the embedding model was validated against.",
      },
      {
        heading: "ANN recall loss is invisible until you measure it",
        body: "HNSW and IVF's recall/latency tuning parameters (ef_search, nprobe, etc.) directly trade accuracy for speed, and the loss compounds silently into every downstream RAG answer — a retrieval system that 'feels fine' in a demo can still be missing a meaningful fraction of true nearest neighbors. Measure recall against a Flat-index baseline on your real data before trusting production defaults.",
      },
      {
        heading: "Hybrid fusion needs rank-based combination, not naive score averaging",
        body: "BM25 scores and cosine-similarity scores live on incomparable scales — averaging them directly lets whichever happens to have a larger numeric range dominate the fused ranking for reasons that have nothing to do with actual relevance. Reciprocal Rank Fusion sidesteps this by fusing on rank position, not raw score.",
      },
    ],
  },
  pitfalls: [
    {
      id: "embeddings-mixed-vector-spaces",
      title: "Search results degrade after a 'routine' embedding model upgrade",
      symptom: "Retrieval quality drops noticeably after swapping to a newer embedding model, with no errors anywhere in the logs.",
      cause: "New queries were embedded with the new model but the existing index still held vectors from the old model — the two vector spaces are incompatible and were silently compared as if they were the same space.",
      fix: "Treat an embedding model change as a full re-index operation: re-embed the entire corpus with the new model before serving any queries against it, and never let old and new vectors coexist in one collection.",
      severity: "high",
    },
    {
      id: "embeddings-wrong-metric",
      title: "Cosine-trained embeddings searched with Euclidean distance",
      symptom: "Retrieved results are plausible but consistently a bit off — relevant documents rank lower than expected.",
      cause: "The vector store's configured distance metric didn't match what the embedding model was trained/recommended for, producing a technically-valid but lower-quality ranking.",
      fix: "Check the embedding model's documented recommended metric (usually cosine for normalized text embeddings) and configure the vector store's collection to match it explicitly.",
      severity: "medium",
    },
    {
      id: "embeddings-ann-recall-untested",
      title: "HNSW defaults quietly miss a meaningful fraction of true matches",
      symptom: "A hard-to-reproduce complaint that 'the answer is definitely in the docs but the system never finds it.'",
      cause: "Default ANN parameters (ef_search, M) were never tuned or measured against the actual corpus; approximate search was trading more recall for speed than anyone realized.",
      fix: "Benchmark ANN recall against an exact Flat-index baseline on representative queries, and tune ef_search/nprobe explicitly for your accuracy target rather than accepting untested defaults.",
      severity: "high",
    },
    {
      id: "embeddings-naive-hybrid-fusion",
      title: "Hybrid search results are dominated entirely by BM25, defeating the point of adding vector search",
      symptom: "After adding vector search alongside existing BM25, the top results barely change.",
      cause: "Fusion averaged raw BM25 and cosine scores directly; BM25's score range dwarfed the cosine similarity range, so vector search's contribution was effectively drowned out.",
      fix: "Use rank-based fusion (Reciprocal Rank Fusion) instead of raw score averaging, so each retriever's contribution is weighted by rank position, not an incomparable raw score scale.",
      severity: "medium",
    },
  ],
  quiz: [
    {
      id: "embeddings-q1",
      question: "What does cosine similarity actually measure between two embedding vectors?",
      options: [
        "The literal word overlap between the two source texts",
        "The angle between the two vectors, ignoring their magnitude",
        "The total number of dimensions in each vector",
        "Whether the two texts are exactly identical",
      ],
      correctIndex: 1,
      explanation: "Cosine similarity measures orientation (the angle) between vectors, not their length — which is why it's the preferred metric for embedding models trained/normalized so that direction carries the semantic signal rather than magnitude.",
      difficulty: "beginner",
    },
    {
      id: "embeddings-q2",
      question: "A team re-indexes using a newer embedding model but forgets to re-embed already-stored chunks. What happens?",
      options: [
        "Nothing — all embedding models share a universal vector space",
        "The system throws a clear dimension-mismatch error immediately",
        "Old and new vectors get silently compared as if compatible, producing degraded, wrong similarity rankings with no error",
        "The vector database automatically detects and migrates old vectors",
      ],
      correctIndex: 2,
      explanation: "Different embedding models (or versions) produce vectors in incompatible spaces. If dimensions happen to match, there's often no error at all — just silently wrong similarity scores, which is why a model change requires a full corpus re-embed, not an incremental update.",
      difficulty: "senior",
    },
    {
      id: "embeddings-q3",
      question: "Why does hybrid search typically outperform either BM25 or dense vector search alone?",
      options: [
        "Because running two retrievers is always better regardless of what they retrieve",
        "Because BM25 and vector search have complementary failure modes — BM25 misses paraphrases, vector search misses exact rare terms — so combining them covers more of the query distribution",
        "Because BM25 is deprecated and only vector search actually works",
        "Because hybrid search is required by every vector database",
      ],
      correctIndex: 1,
      explanation: "BM25 excels at exact lexical matches (codes, rare names) that embeddings can blur past; dense vector search excels at semantic paraphrases BM25 can't match. Their complementary strengths are exactly why fusing them outperforms either alone on real-world query mixes.",
      difficulty: "intermediate",
    },
    {
      id: "embeddings-q4",
      question: "Why does Reciprocal Rank Fusion combine results by rank position instead of averaging raw retriever scores?",
      options: [
        "Rank-based fusion is simpler to implement, which is the only reason",
        "BM25 scores and cosine-similarity scores live on different, incomparable scales — averaging raw scores lets whichever has a larger numeric range dominate for reasons unrelated to actual relevance",
        "Raw score averaging is mathematically identical to rank fusion",
        "Rank fusion is only used when BM25 is unavailable",
      ],
      correctIndex: 1,
      explanation: "A BM25 score of 12.4 and a cosine similarity of 0.82 aren't comparable magnitudes. RRF sidesteps this entirely by using each result's rank position in its own list, which is why it's the standard way to fuse heterogeneous retrievers without one silently dominating.",
      difficulty: "senior",
    },
    {
      id: "embeddings-q5",
      question: "What's the main practical trade-off between a Flat index and an HNSW index for vector search?",
      options: [
        "Flat is always faster but less accurate than HNSW",
        "Flat guarantees exact nearest-neighbor results but scales linearly with corpus size; HNSW is approximate but scales much better at the cost of extra memory and tunable recall",
        "HNSW requires no memory at all compared to Flat",
        "There is no meaningful difference between the two for any corpus size",
      ],
      correctIndex: 1,
      explanation: "Flat search is exhaustive and exact, which guarantees perfect recall but doesn't scale past tens of thousands of vectors at interactive latency. HNSW builds a graph structure to prune most of the search space, trading a tunable amount of recall for much better scalability, at higher memory cost than a simple flat array.",
      difficulty: "intermediate",
    },
  ],
  presets: [
    {
      id: "embeddings-metric-showdown",
      label: "Cosine vs dot vs euclidean on the same vector pair",
      description: "Compute all three similarity metrics on the same embedding pair and see how differently they rank a set of candidates.",
    },
    {
      id: "embeddings-chunk-size-200-vs-1000",
      label: "Chunk size 200 vs 1000 on the same document",
      description: "Preview chunk boundaries at two very different chunk sizes on identical source text and compare how much context each chunk preserves.",
    },
    {
      id: "embeddings-index-tradeoffs",
      label: "Flat vs HNSW vs IVF latency/recall on one corpus",
      description: "Run the same search against all three index types on the same collection and compare measured latency against recall relative to the Flat baseline.",
    },
    {
      id: "embeddings-hybrid-vs-vector-only",
      label: "Hybrid search vs vector-only on a keyword-heavy query",
      description: "Search for a rare exact term (like a product code) with vector-only search versus hybrid BM25+vector search and see the difference in top results.",
    },
    {
      id: "embeddings-rerank-before-after",
      label: "Before/after reranking on the same candidate set",
      description: "Retrieve an initial top-20 candidate set, then rerank it and compare the before/after ordering side by side.",
    },
  ],
};
