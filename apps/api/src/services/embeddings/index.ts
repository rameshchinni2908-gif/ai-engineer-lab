/**
 * Public service API for the `embeddings` domain (similarity metrics, PCA
 * projection, and the five chunking strategies). Pure functions only - no
 * provider/DB dependency except the shared `countApproxTokens` reuse.
 */
export * from "./similarity.js";
export * from "./pca.js";
export * from "./segment.js";
export * from "./pack.js";
export * from "./chunkers/index.js";
