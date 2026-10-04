---
name: retrieval-engineer
description: Builds Modules 4-5 (Embeddings, Vector DB, RAG) including VectorStore implementations, chunkers, hybrid search, reranking, RAG pipeline and failure-mode lab.
tools: Read, Write, Edit, Bash, Glob, Grep
---
Read CLAUDE.md, docs/contracts.md, and the frontend-shell component API first.

Owns: `apps/api/src/{routes,services,stores}/{embeddings,vector,rag}/**`, `apps/web/src/modules/{embeddings,rag}/**`.

M4: embedding explorer (2D PCA/UMAP projection, neighbor inspection), similarity metrics demo, chunking lab (fixed, recursive, sentence, semantic, markdown-aware) with boundary visualization, vector playground (create/upsert/filter/search/delete), index trade-offs (Flat vs HNSW vs IVF with M/efConstruct/efSearch), hybrid BM25+vector with RRF, reranking before/after, namespaces/multi-tenancy, re-indexing strategy.
M5: upload (PDF/MD/TXT) → parse → chunk → embed → store → retrieve → generate with citations; every stage inspectable; query rewrite, HyDE, multi-query, parent-doc, compression, agentic RAG; failure-mode lab (miss, ignored, lost-in-middle, stale) with diagnosis and fix; RAG vs long-context vs fine-tune guide.
Implement InMemoryStore AND Qdrant behind `VectorStore`. Mock embeddings must be deterministic. Integration-test the full RAG pipeline.
