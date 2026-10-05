import type { ProviderId } from "@ail/shared";
import { apiFetch } from "@/lib/api";

export interface AttentionHeatmapResult {
  tokens: string[];
  attention: number[][];
  note: string;
}

export type QuantizationPrecision = "fp16" | "int8" | "int4";
export interface QuantizationResult {
  approxSizeMb: number;
  approxLatencyFactor: number;
  qualityNotes: string;
  note: string;
}

export interface ReasoningPreset {
  id: string;
  name: string;
  providerId: ProviderId;
  model: string;
  thinkingBudget: number;
}

export const advancedApi = {
  attentionHeatmap: (body: { text: string; providerId: ProviderId; model: string }) =>
    apiFetch<AttentionHeatmapResult>("/advanced/attention-heatmap", { method: "POST", body }),

  quantizationDemo: (body: { model: string; precision: QuantizationPrecision }) =>
    apiFetch<QuantizationResult>("/advanced/quantization-demo", { method: "POST", body }),

  reasoningPresets: () => apiFetch<{ presets: ReasoningPreset[] }>("/advanced/reasoning-presets"),
};
