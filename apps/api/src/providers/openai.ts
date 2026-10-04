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
  type LogProb,
} from "@ail/shared";
import { countApproxTokens } from "../services/runs/tokenizer.js";
import { readSseFrames } from "./anthropic.js";
import { buildProviderErrorMessage } from "./http-error.js";

const API_BASE = "https://api.openai.com/v1";
const FALLBACK_MODEL = MODEL_CATALOG.find((m) => m.id === "gpt-4o-mini")!;

function blocksToText(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => (b.type === "text" ? b.text : b.type === "tool_result" ? b.content : ""))
    .join(" ");
}

function toOpenAiMessages(messages: Message[], system?: string): Record<string, unknown>[] {
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

function headers(): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
  };
}

function buildBody(req: GenerateRequest, stream: boolean): Record<string, unknown> {
  const p = req.params ?? {};
  const info = findModel(req.model);
  return {
    model: req.model,
    messages: toOpenAiMessages(req.messages, req.system),
    temperature: p.temperature,
    top_p: p.topP,
    max_tokens: p.maxTokens,
    stop: p.stop,
    presence_penalty: p.presencePenalty,
    frequency_penalty: p.frequencyPenalty,
    logprobs: info?.supportsLogprobs ? true : undefined,
    top_logprobs: info?.supportsLogprobs ? 5 : undefined,
    stream,
  };
}

interface OpenAiLogprobContent {
  token: string;
  logprob: number;
  top_logprobs: { token: string; logprob: number }[];
}

function mapLogprobs(content: OpenAiLogprobContent[] | null | undefined): LogProb[] | undefined {
  if (!content) return undefined;
  return content.map((c) => ({
    token: c.token,
    logprob: c.logprob,
    topAlternatives: c.top_logprobs
      .filter((t) => t.token !== c.token)
      .map((t) => ({ token: t.token, logprob: t.logprob })),
  }));
}

/**
 * OpenAI Chat Completions API via plain `fetch`. Requests `logprobs`/
 * `top_logprobs` whenever the target `ModelInfo.supportsLogprobs` is true,
 * and maps the real response logprobs 1:1 onto `LogProb[]` - never
 * synthesized, unlike the Mock provider's honestly-simulated distribution.
 */
export class OpenAIProvider implements LLMProvider {
  readonly id = "openai" as const;

  async listModels() {
    return MODEL_CATALOG.filter((m) => m.providerId === "openai");
  }

  async countTokens(text: string, _model: string): Promise<number> {
    return countApproxTokens(text);
  }

  estimateCost(usage: TokenUsage, model: string): CostBreakdown {
    const info = findModel(model) ?? FALLBACK_MODEL;
    return estimateCostUsd(usage, info);
  }

  async embed(texts: string[], model: string): Promise<number[][]> {
    const res = await fetch(`${API_BASE}/embeddings`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ input: texts, model }),
    });
    if (!res.ok) throw new Error(buildProviderErrorMessage("OpenAI embeddings", res.status, await res.text()));
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => d.embedding);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const start = Date.now();
    const res = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(buildBody(req, false)),
    });
    if (!res.ok) throw new Error(buildProviderErrorMessage("OpenAI", res.status, await res.text()));
    const json = (await res.json()) as {
      choices: {
        message: { content: string };
        finish_reason: string;
        logprobs?: { content: OpenAiLogprobContent[] };
      }[];
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    const choice = json.choices[0]!;
    const usage: TokenUsage = {
      inputTokens: json.usage.prompt_tokens,
      outputTokens: json.usage.completion_tokens,
      totalTokens: json.usage.prompt_tokens + json.usage.completion_tokens,
    };
    return {
      text: choice.message.content,
      finishReason: choice.finish_reason === "length" ? "length" : "stop",
      usage,
      cost: this.estimateCost(usage, req.model),
      logprobs: mapLogprobs(choice.logprobs?.content),
      latencyMs: Date.now() - start,
    };
  }

  async *stream(req: GenerateRequest): AsyncIterable<ProviderStreamEvent> {
    const res = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(buildBody(req, true)),
    });
    if (!res.ok || !res.body) throw new Error(buildProviderErrorMessage("OpenAI", res.status, await res.text()));

    let text = "";
    let index = 0;
    let finishReason = "stop";
    const logprobs: LogProb[] = [];

    for await (const frame of readSseFrames(res.body)) {
      if (!frame.data) continue;
      const parsed = JSON.parse(frame.data) as {
        choices: {
          delta?: { content?: string };
          finish_reason?: string;
          logprobs?: { content: OpenAiLogprobContent[] };
        }[];
      };
      const choice = parsed.choices[0];
      if (!choice) continue;
      const token = choice.delta?.content;
      if (token) {
        text += token;
        yield { type: "token", token, index: index++ };
      }
      const mapped = mapLogprobs(choice.logprobs?.content);
      if (mapped && mapped.length > 0) {
        logprobs.push(...mapped);
        yield { type: "logprobs", logprobs: mapped };
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    const inputTokens = await this.countTokens(
      req.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n"),
      req.model,
    );
    const outputTokens = await this.countTokens(text, req.model);
    const usage: TokenUsage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
    yield {
      type: "done",
      result: {
        text,
        finishReason: finishReason === "length" ? "length" : "stop",
        usage,
        cost: this.estimateCost(usage, req.model),
        logprobs: logprobs.length > 0 ? logprobs : undefined,
        latencyMs: 0,
      },
    };
  }
}
