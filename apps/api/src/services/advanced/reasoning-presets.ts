import type { ProviderId } from "@ail/shared";

export interface ReasoningPreset {
  id: string;
  name: string;
  providerId: ProviderId;
  model: string;
  thinkingBudget: number;
}

/**
 * `GET /advanced/reasoning-presets`. Per contracts §4 M10's decision: this
 * route ONLY returns preset metadata. Actually running a preset reuses M1's
 * `POST /fundamentals/sample` with `params.thinkingBudget` set here - there
 * is intentionally no `/advanced` generation route.
 */
export function listReasoningPresets(): ReasoningPreset[] {
  return [
    { id: "reasoning-none", name: "No extended thinking (budget 0)", providerId: "mock", model: "mock-large", thinkingBudget: 0 },
    { id: "reasoning-light", name: "Light budget (512 tokens)", providerId: "mock", model: "mock-large", thinkingBudget: 512 },
    { id: "reasoning-moderate", name: "Moderate budget (2048 tokens)", providerId: "mock", model: "mock-large", thinkingBudget: 2048 },
    { id: "reasoning-deep", name: "Deep budget (8192 tokens)", providerId: "mock", model: "mock-large", thinkingBudget: 8192 },
  ];
}
