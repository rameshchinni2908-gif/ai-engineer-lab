export type QuantizationPrecision = "fp16" | "int8" | "int4";

export interface QuantizationDemoRequest {
  model: string;
  precision: QuantizationPrecision;
}

export interface QuantizationDemoResult {
  approxSizeMb: number;
  approxLatencyFactor: number;
  qualityNotes: string;
  note: string;
}

/** Illustrative-only parameter-count table (billions), order-of-magnitude per CLAUDE.md - NOT a verified real parameter count for every catalog entry. */
const ILLUSTRATIVE_PARAM_BILLIONS: Record<string, number> = {
  "claude-opus-5": 200,
  "claude-sonnet-5": 70,
  "claude-haiku-4-5-20251001": 20,
  "gpt-4o": 200,
  "gpt-4o-mini": 8,
  "llama3.1:8b": 8,
  "mock-small": 1,
  "mock-large": 7,
};
const DEFAULT_PARAM_BILLIONS = 8;

const BYTES_PER_PARAM: Record<QuantizationPrecision, number> = {
  fp16: 2,
  int8: 1,
  int4: 0.5,
};

/** Illustrative relative speed multiplier vs. fp16 (1.0 = fp16 baseline; lower = faster). */
const LATENCY_FACTOR: Record<QuantizationPrecision, number> = {
  fp16: 1,
  int8: 0.62,
  int4: 0.4,
};

const QUALITY_NOTES: Record<QuantizationPrecision, string> = {
  fp16: "Full precision; no quantization-induced quality loss expected.",
  int8: "Typically minimal quality loss for most free-text tasks; precision-sensitive tasks (exact arithmetic, close code logic) may show small, task-specific regressions - measure on your own eval set.",
  int4: "More noticeable quality-loss risk than int8, especially for precision-sensitive or long multi-step reasoning tasks; validate directly against your actual deployment model and task before shipping.",
};

const ILLUSTRATIVE_NOTE =
  "Order-of-magnitude illustration only - NOT an authoritative benchmark for this specific model. Real quantization impact varies by model architecture and task; measure your own deployment target directly.";

/**
 * `POST /advanced/quantization-demo`. Purely computed from illustrative
 * constants - no provider call, no `Run`. `approxSizeMb` applies the real
 * arithmetic (paramCount x bytesPerParam) to a DISCLOSED-ILLUSTRATIVE
 * parameter count, so the number itself is honestly derived even though its
 * input is an approximation, not a verified spec.
 */
export function computeQuantizationDemo(req: QuantizationDemoRequest): QuantizationDemoResult {
  const paramsBillion = ILLUSTRATIVE_PARAM_BILLIONS[req.model] ?? DEFAULT_PARAM_BILLIONS;
  const bytesPerParam = BYTES_PER_PARAM[req.precision];
  const sizeBytes = paramsBillion * 1_000_000_000 * bytesPerParam;
  const approxSizeMb = sizeBytes / (1024 * 1024);

  return {
    approxSizeMb,
    approxLatencyFactor: LATENCY_FACTOR[req.precision],
    qualityNotes: QUALITY_NOTES[req.precision],
    note: ILLUSTRATIVE_NOTE,
  };
}
