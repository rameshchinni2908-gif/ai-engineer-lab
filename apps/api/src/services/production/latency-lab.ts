import type { GenerationParams, ProviderId } from "@ail/shared";

export interface LatencyLabPreset {
  id: string;
  name: string;
  providerId: ProviderId;
  model: string;
  params: GenerationParams;
}

/**
 * `GET /production/latency-lab/presets`. Static presets spanning the
 * TTFT/tokens-per-second trade-off space - short vs. long output, with vs.
 * without a thinking budget - so "where does time actually go" has
 * something concrete to compare. `POST /production/latency-lab/run` is a
 * thin route-level wrapper over backend-core's `streamGeneration` (no
 * service function needed here - see `routes/production/index.ts`).
 */
export function listLatencyLabPresets(): LatencyLabPreset[] {
  return [
    {
      id: "latency-short-fast",
      name: "Short answer, small model",
      providerId: "mock",
      model: "mock-small",
      params: { temperature: 0.3, maxTokens: 64 },
    },
    {
      id: "latency-long-fast",
      name: "Long answer, small model",
      providerId: "mock",
      model: "mock-small",
      params: { temperature: 0.3, maxTokens: 512 },
    },
    {
      id: "latency-short-large",
      name: "Short answer, large model",
      providerId: "mock",
      model: "mock-large",
      params: { temperature: 0.3, maxTokens: 64 },
    },
    {
      id: "latency-thinking-budget",
      name: "Reasoning with a thinking budget",
      providerId: "mock",
      model: "mock-large",
      params: { temperature: 0.3, maxTokens: 256, thinkingBudget: 2048 },
    },
  ];
}
