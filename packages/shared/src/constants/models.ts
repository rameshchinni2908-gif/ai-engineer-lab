import type { ModelInfo } from "../schemas/model.js";

// Prices below are illustrative placeholders for the learning app's cost
// calculators; verify against provider pricing pages before using them for
// anything authoritative. Model IDs are real/public as of this writing.
export const MODEL_CATALOG: ModelInfo[] = [
  {
    id: "claude-opus-5",
    providerId: "anthropic",
    displayName: "Claude Opus 5",
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    inputCostPerMTok: 15, // verify against provider pricing pages; treated as illustrative
    outputCostPerMTok: 75, // verify against provider pricing pages; treated as illustrative
    supportsTools: true,
    supportsLogprobs: false,
    supportsStreaming: true,
    supportsVision: true,
    supportsThinking: true,
  },
  {
    id: "claude-sonnet-5",
    providerId: "anthropic",
    displayName: "Claude Sonnet 5",
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    inputCostPerMTok: 3, // verify against provider pricing pages; treated as illustrative
    outputCostPerMTok: 15, // verify against provider pricing pages; treated as illustrative
    supportsTools: true,
    supportsLogprobs: false,
    supportsStreaming: true,
    supportsVision: true,
    supportsThinking: true,
  },
  {
    id: "claude-haiku-4-5-20251001",
    providerId: "anthropic",
    displayName: "Claude Haiku 4.5",
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    inputCostPerMTok: 0.8, // verify against provider pricing pages; treated as illustrative
    outputCostPerMTok: 4, // verify against provider pricing pages; treated as illustrative
    supportsTools: true,
    supportsLogprobs: false,
    supportsStreaming: true,
    supportsVision: true,
    supportsThinking: false,
  },
  {
    id: "gpt-4o",
    providerId: "openai",
    displayName: "GPT-4o",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputCostPerMTok: 2.5, // verify against provider pricing pages; treated as illustrative
    outputCostPerMTok: 10, // verify against provider pricing pages; treated as illustrative
    supportsTools: true,
    supportsLogprobs: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsThinking: false,
  },
  {
    id: "gpt-4o-mini",
    providerId: "openai",
    displayName: "GPT-4o mini",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputCostPerMTok: 0.15, // verify against provider pricing pages; treated as illustrative
    outputCostPerMTok: 0.6, // verify against provider pricing pages; treated as illustrative
    supportsTools: true,
    supportsLogprobs: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsThinking: false,
  },
  {
    id: "llama3.1:8b",
    providerId: "ollama",
    displayName: "Llama 3.1 8B (Ollama, local)",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputCostPerMTok: 0, // local inference, no per-token billing
    outputCostPerMTok: 0,
    supportsTools: true,
    supportsLogprobs: false,
    supportsStreaming: true,
    supportsVision: false,
    supportsThinking: false,
  },
  {
    id: "nomic-embed-text",
    providerId: "ollama",
    displayName: "Nomic Embed Text (Ollama, local)",
    contextWindow: 8_192,
    maxOutputTokens: 0,
    inputCostPerMTok: 0,
    outputCostPerMTok: 0,
    supportsTools: false,
    supportsLogprobs: false,
    supportsStreaming: false,
    supportsVision: false,
    supportsThinking: false,
  },
  {
    id: "mock-small",
    providerId: "mock",
    displayName: "Mock Small (deterministic, zero-key)",
    contextWindow: 16_000,
    maxOutputTokens: 4_000,
    inputCostPerMTok: 0,
    outputCostPerMTok: 0,
    supportsTools: true,
    supportsLogprobs: true,
    supportsStreaming: true,
    supportsVision: false,
    supportsThinking: false,
  },
  {
    id: "mock-large",
    providerId: "mock",
    displayName: "Mock Large (deterministic, zero-key)",
    contextWindow: 128_000,
    maxOutputTokens: 16_000,
    inputCostPerMTok: 0,
    outputCostPerMTok: 0,
    supportsTools: true,
    supportsLogprobs: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsThinking: true,
  },
];

export function findModel(modelId: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === modelId);
}

/** Pure helper: compute a CostBreakdown from token usage + a model's per-MTok rates. */
export function estimateCostUsd(
  usage: { inputTokens: number; outputTokens: number },
  model: Pick<ModelInfo, "inputCostPerMTok" | "outputCostPerMTok">,
): { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number; currency: "USD" } {
  const inputCostUsd = (usage.inputTokens / 1_000_000) * model.inputCostPerMTok;
  const outputCostUsd = (usage.outputTokens / 1_000_000) * model.outputCostPerMTok;
  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
    currency: "USD",
  };
}
