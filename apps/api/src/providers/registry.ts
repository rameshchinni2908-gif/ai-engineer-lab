import type { LLMProvider, ProviderId } from "@ail/shared";
import { MockProvider } from "./mock.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";

const instances: Partial<Record<ProviderId, LLMProvider>> = {};

function build(id: ProviderId): LLMProvider {
  switch (id) {
    case "anthropic":
      return new AnthropicProvider();
    case "openai":
      return new OpenAIProvider();
    case "ollama":
      return new OllamaProvider();
    case "mock":
      return new MockProvider();
  }
}

/** Returns (and memoizes) the `LLMProvider` instance for `id`. */
export function getProvider(id: ProviderId): LLMProvider {
  return (instances[id] ??= build(id));
}

/** Resolves the default provider from `LLM_PROVIDER` (defaults to `mock`, which MUST always work with zero keys). */
export function getDefaultProviderId(): ProviderId {
  const envValue = process.env.LLM_PROVIDER as ProviderId | undefined;
  if (envValue === "anthropic" || envValue === "openai" || envValue === "ollama" || envValue === "mock") {
    return envValue;
  }
  return "mock";
}

/** `true` iff the given provider has the configuration (key/URL) it needs to be called for real. */
export function isProviderConfigured(id: ProviderId): boolean {
  switch (id) {
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY);
    case "ollama":
      return true; // local, no key required; availability is a live-reachability concern, not config
    case "mock":
      return true;
  }
}

export const PROVIDER_IDS: ProviderId[] = ["anthropic", "openai", "ollama", "mock"];
