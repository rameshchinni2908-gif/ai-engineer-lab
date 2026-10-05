/**
 * Public service API for the `embeddings` domain: similarity metrics, PCA
 * projection, the five chunking strategies (all pure functions, no
 * provider/DB dependency except the shared `countApproxTokens` reuse), and
 * `embedTexts` (the ONLY sanctioned way to call `LLMProvider.embed()` -
 * records a Run, per contracts.md §2.3).
 */
export * from "./similarity.js";
export * from "./pca.js";
export * from "./segment.js";
export * from "./pack.js";
export * from "./chunkers/index.js";
export * from "./embed.js";
