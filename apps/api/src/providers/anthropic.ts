import {
  findModel,
  estimateCostUsd,
  MODEL_CATALOG,
  type LLMProvider,
  type GenerateRequest,
  type GenerateResult,
  type ProviderStreamEvent,
  type Message,
  type TokenUsage,
  type CostBreakdown,
  type ContentBlock,
} from "@ail/shared";
import { countApproxTokens } from "../services/runs/tokenizer.js";
import { buildProviderErrorMessage } from "./http-error.js";

const API_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";
const FALLBACK_MODEL = MODEL_CATALOG.find((m) => m.id === "claude-sonnet-5")!;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

function toAnthropicMessages(messages: Message[]): AnthropicMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: typeof m.content === "string" ? m.content : blocksToText(m.content),
    }));
}

function blocksToText(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => (b.type === "text" ? b.text : b.type === "tool_result" ? b.content : ""))
    .join(" ");
}

function headers(): Record<string, string> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

function buildBody(req: GenerateRequest, stream: boolean): Record<string, unknown> {
  const p = req.params ?? {};
  return {
    model: req.model,
    max_tokens: p.maxTokens ?? 1024,
    messages: toAnthropicMessages(req.messages),
    system: req.system,
    temperature: p.temperature,
    top_p: p.topP,
    top_k: p.topK,
    stop_sequences: p.stop,
    stream,
  };
}

/**
 * Anthropic Messages API via plain `fetch` (no SDK, per CLAUDE.md). Anthropic
 * does not expose token-level logprobs, so `supportsLogprobs` is false on
 * every Anthropic `ModelInfo` entry and this provider never fabricates them.
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic" as const;

  async listModels() {
    return MODEL_CATALOG.filter((m) => m.providerId === "anthropic");
  }

  async countTokens(text: string, _model: string): Promise<number> {
    // Anthropic has no public standalone tokenizer endpoint; approximate.
    return countApproxTokens(text);
  }

  estimateCost(usage: TokenUsage, model: string): CostBreakdown {
    const info = findModel(model) ?? FALLBACK_MODEL;
    return estimateCostUsd(usage, info);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const start = Date.now();
    const res = await fetch(`${API_BASE}/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(buildBody(req, false)),
    });
    if (!res.ok) {
      throw new Error(buildProviderErrorMessage("Anthropic", res.status, await res.text()));
    }
    const json = (await res.json()) as {
      content: { type: string; text?: string }[];
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };
    const text = json.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    const usage: TokenUsage = {
      inputTokens: json.usage.input_tokens,
      outputTokens: json.usage.output_tokens,
      totalTokens: json.usage.input_tokens + json.usage.output_tokens,
    };
    return {
      text,
      finishReason: json.stop_reason === "max_tokens" ? "length" : "stop",
      usage,
      cost: this.estimateCost(usage, req.model),
      latencyMs: Date.now() - start,
    };
  }

  async *stream(req: GenerateRequest): AsyncIterable<ProviderStreamEvent> {
    const res = await fetch(`${API_BASE}/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(buildBody(req, true)),
    });
    if (!res.ok || !res.body) {
      throw new Error(buildProviderErrorMessage("Anthropic", res.status, await res.text()));
    }

    let text = "";
    let index = 0;
    let stopReason = "end_turn";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const frame of readSseFrames(res.body)) {
      const data = frame.data;
      if (!data) continue;
      const parsed = JSON.parse(data) as {
        type: string;
        delta?: { type: string; text?: string; stop_reason?: string };
        message?: { usage?: { input_tokens: number } };
        usage?: { output_tokens: number };
      };
      if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
        const token = parsed.delta.text ?? "";
        text += token;
        yield { type: "token", token, index: index++ };
      } else if (parsed.type === "message_delta") {
        stopReason = parsed.delta?.stop_reason ?? stopReason;
        outputTokens = parsed.usage?.output_tokens ?? outputTokens;
      } else if (parsed.type === "message_start") {
        inputTokens = parsed.message?.usage?.input_tokens ?? 0;
      }
    }

    const usage: TokenUsage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
    yield {
      type: "done",
      result: {
        text,
        finishReason: stopReason === "max_tokens" ? "length" : "stop",
        usage,
        cost: this.estimateCost(usage, req.model),
        latencyMs: 0,
      },
    };
  }
}

/** Minimal SSE line-frame reader shared by every real provider's streaming path. */
export async function* readSseFrames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event?: string; data?: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawFrame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        const frame: { event?: string; data?: string } = {};
        for (const line of rawFrame.split("\n")) {
          if (line.startsWith("event:")) frame.event = line.slice(6).trim();
          else if (line.startsWith("data:")) frame.data = line.slice(5).trim();
        }
        if (frame.data === "[DONE]") return;
        if (frame.data !== undefined) yield frame;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
