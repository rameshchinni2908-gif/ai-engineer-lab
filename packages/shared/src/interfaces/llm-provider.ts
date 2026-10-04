import type { Message } from "../schemas/message.js";
import type { GenerationParams, TokenUsage, CostBreakdown, LogProb } from "../schemas/generation.js";
import type { ModelInfo } from "../schemas/model.js";
import type { ToolDefinition, ToolCall } from "../schemas/tool.js";
import type { ProviderId } from "../schemas/common.js";

export interface GenerateRequest {
  model: string;
  messages: Message[];
  params?: GenerationParams;
  tools?: ToolDefinition[];
  system?: string;
}

export interface GenerateResult {
  text: string;
  toolCalls?: ToolCall[];
  parsedJson?: unknown;
  finishReason?: "stop" | "length" | "tool_calls" | "content_filter" | "error";
  usage: TokenUsage;
  cost: CostBreakdown;
  logprobs?: LogProb[];
  latencyMs: number;
}

/** Streamed-chunk events a provider emits while generating. Mapped to `SseEvent`s by the caller. */
export type ProviderStreamEvent =
  | { type: "token"; token: string; index: number }
  | { type: "logprobs"; logprobs: LogProb[] }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "done"; result: GenerateResult };

/**
 * Uniform interface implemented by every LLM backend (Anthropic, OpenAI, Ollama,
 * and the deterministic Mock provider). The app MUST function fully against the
 * Mock implementation with zero API keys configured.
 */
export interface LLMProvider {
  readonly id: ProviderId;
  listModels(): Promise<ModelInfo[]>;
  generate(req: GenerateRequest): Promise<GenerateResult>;
  stream(req: GenerateRequest): AsyncIterable<ProviderStreamEvent>;
  countTokens(text: string, model: string): Promise<number>;
  estimateCost(usage: TokenUsage, model: string): CostBreakdown;
  embed?(texts: string[], model: string): Promise<number[][]>;
}
