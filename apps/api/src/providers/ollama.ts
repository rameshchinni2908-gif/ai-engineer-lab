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

const FALLBACK_MODEL = MODEL_CATALOG.find((m) => m.id === "llama3.1:8b")!;

function baseUrl(): string {
  return process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
}

function blocksToText(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => (b.type === "text" ? b.text : b.type === "tool_result" ? b.content : ""))
    .join(" ");
}

function toOllamaMessages(messages: Message[], system?: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    out.push({
      role: m.role,
      content: typeof m.content === "string" ? m.content : blocksToText(m.content),
    });
  }
  return out;
}

function buildBody(req: GenerateRequest, stream: boolean): Record<string, unknown> {
  const p = req.params ?? {};
  return {
    model: req.model,
    messages: toOllamaMessages(req.messages, req.system),
    stream,
    options: {
      temperature: p.temperature,
      top_p: p.topP,
      top_k: p.topK,
      stop: p.stop,
      num_predict: p.maxTokens,
      presence_penalty: p.presencePenalty,
      frequency_penalty: p.frequencyPenalty,
      seed: p.seed,
    },
  };
}

/** Parses newline-delimited JSON chunks (Ollama's streaming wire format - NOT SSE). */
async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.length > 0) yield JSON.parse(line);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Ollama local runtime via plain `fetch`. No API key (local-only); cost is
 * always $0 per `MODEL_CATALOG`'s zero per-token rates for `ollama` models.
 * Streaming is NDJSON, not SSE - handled by `readNdjson` rather than the
 * `readSseFrames` helper the hosted providers share.
 */
export class OllamaProvider implements LLMProvider {
  readonly id = "ollama" as const;

  async listModels() {
    try {
      const res = await fetch(`${baseUrl()}/api/tags`);
      if (!res.ok) return MODEL_CATALOG.filter((m) => m.providerId === "ollama");
      const json = (await res.json()) as { models?: { name: string }[] };
      const live = json.models ?? [];
      const catalog = MODEL_CATALOG.filter((m) => m.providerId === "ollama");
      const catalogIds = new Set(catalog.map((m) => m.id));
      const extra = live
        .filter((m) => !catalogIds.has(m.name))
        .map((m) => ({
          id: m.name,
          providerId: "ollama" as const,
          displayName: `${m.name} (Ollama, local)`,
          contextWindow: 8192,
          maxOutputTokens: 4096,
          inputCostPerMTok: 0,
          outputCostPerMTok: 0,
          supportsTools: false,
          supportsLogprobs: false,
          supportsStreaming: true,
          supportsVision: false,
          supportsThinking: false,
        }));
      return [...catalog, ...extra];
    } catch {
      return MODEL_CATALOG.filter((m) => m.providerId === "ollama");
    }
  }

  async countTokens(text: string, _model: string): Promise<number> {
    return countApproxTokens(text);
  }

  estimateCost(usage: TokenUsage, model: string): CostBreakdown {
    const info = findModel(model) ?? FALLBACK_MODEL;
    return estimateCostUsd(usage, info);
  }

  async embed(texts: string[], model: string): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const res = await fetch(`${baseUrl()}/api/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, prompt: text }),
      });
      if (!res.ok) throw new Error(buildProviderErrorMessage("Ollama embeddings", res.status, await res.text()));
      const json = (await res.json()) as { embedding: number[] };
      results.push(json.embedding);
    }
    return results;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const start = Date.now();
    const res = await fetch(`${baseUrl()}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildBody(req, false)),
    });
    if (!res.ok) throw new Error(buildProviderErrorMessage("Ollama", res.status, await res.text()));
    const json = (await res.json()) as {
      message: { content: string };
      prompt_eval_count?: number;
      eval_count?: number;
      done_reason?: string;
    };
    const usage: TokenUsage = {
      inputTokens: json.prompt_eval_count ?? 0,
      outputTokens: json.eval_count ?? 0,
      totalTokens: (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0),
    };
    return {
      text: json.message.content,
      finishReason: json.done_reason === "length" ? "length" : "stop",
      usage,
      cost: this.estimateCost(usage, req.model),
      latencyMs: Date.now() - start,
    };
  }

  async *stream(req: GenerateRequest): AsyncIterable<ProviderStreamEvent> {
    const res = await fetch(`${baseUrl()}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildBody(req, true)),
    });
    if (!res.ok || !res.body) throw new Error(buildProviderErrorMessage("Ollama", res.status, await res.text()));

    let text = "";
    let index = 0;
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let finishReason: "stop" | "length" = "stop";

    for await (const chunk of readNdjson(res.body)) {
      const c = chunk as {
        message?: { content?: string };
        done?: boolean;
        prompt_eval_count?: number;
        eval_count?: number;
        done_reason?: string;
      };
      const token = c.message?.content;
      if (token) {
        text += token;
        yield { type: "token", token, index: index++ };
      }
      if (c.done) {
        usage = {
          inputTokens: c.prompt_eval_count ?? 0,
          outputTokens: c.eval_count ?? 0,
          totalTokens: (c.prompt_eval_count ?? 0) + (c.eval_count ?? 0),
        };
        finishReason = c.done_reason === "length" ? "length" : "stop";
      }
    }

    yield {
      type: "done",
      result: {
        text,
        finishReason,
        usage,
        cost: this.estimateCost(usage, req.model),
        latencyMs: 0,
      },
    };
  }
}
