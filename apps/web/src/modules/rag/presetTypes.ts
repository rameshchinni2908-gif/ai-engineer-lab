import type { ChunkStrategy } from "@ail/shared";
import type { FailureMode, RagStrategy } from "./api";

/**
 * Flat, shared preset-param shape for the whole M5 page - each sub-component
 * reads only the fields it owns. Every consumer MUST check `!== undefined`,
 * never truthiness: `topK: 0` or `chunkOverlap: 0` are valid preset values.
 */
export interface RagPresetParams {
  /** Collection to target (defaults to the seeded `nimbus-kb` demo corpus when set). */
  collection?: string;
  // QueryPlayground
  strategy?: RagStrategy;
  topK?: number;
  query?: string;
  // UploadAndIngest
  chunkStrategy?: ChunkStrategy;
  chunkSize?: number;
  chunkOverlap?: number;
  // FailureModeLab
  failureMode?: FailureMode;
}
