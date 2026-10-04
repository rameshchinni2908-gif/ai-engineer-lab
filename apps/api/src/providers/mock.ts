import { randomUUID } from "node:crypto";
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
  type LogProb,
  type ToolCall,
} from "@ail/shared";
import { hashString, combineSeed, mulberry32 } from "./prng.js";
import { sampleCandidate, type Candidate } from "./sampling.js";
import { ALTERNATE_POOL, extractTopic, selectTemplate } from "./mock-corpus.js";
import { countApproxTokens } from "../services/runs/tokenizer.js";

const FALLBACK_MODEL = MODEL_CATALOG.find((m) => m.id === "mock-small")!;
const EMBED_DIM = 64;

function messageToText(msg: Message): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "tool_result") return block.content;
      return "";
    })
    .join(" ");
}

function requestPromptText(req: GenerateRequest): string {
  const sys = req.system ? `${req.system}\n` : "";
  return sys + req.messages.map(messageToText).join("\n");
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Builds the per-word candidate set: anchor words have one candidate (the
 * template's own word); "variable" slots additionally offer the shared
 * alternate-word pool so temperature/top-p/top-k have something to act on. */
function buildCandidates(word: string, isVariable: boolean): Candidate[] {
  const core = word.replace(/[.,]$/, "");
  const trailingPunct = word.slice(core.length);
  if (!isVariable || !/^[a-zA-Z]+$/.test(core)) {
    return [{ token: word, baseLogit: 3 }];
  }
  return [
    { token: word, baseLogit: 3 },
    ...ALTERNATE_POOL.map((alt, idx) => ({
      token: `${alt}${trailingPunct}`,
      baseLogit: 2 - idx * 0.3,
    })),
  ];
}

/** Deterministic hash-to-unit-vector embedding (feature-hashed bag of words). */
function embedText(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const w of words) {
    const h1 = hashString(w);
    const h2 = hashString(`${w}#sign`);
    const idx = h1 % EMBED_DIM;
    const sign = h2 % 2 === 0 ? 1 : -1;
    vec[idx] = (vec[idx] ?? 0) + sign;
  }
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

interface MockGenOutcome {
  text: string;
  finishReason: "stop" | "length" | "tool_calls";
  logprobs: LogProb[];
  tokenEvents: ProviderStreamEvent[];
  toolCall?: ToolCall;
}

/** Deterministic mock "tool call" chosen by hashing the request + first tool. */
function buildMockToolCall(req: GenerateRequest, seed: number): ToolCall {
  const tool = req.tools![seed % req.tools!.length]!;
  return {
    id: `call_${seed.toString(16)}`,
    name: tool.name,
    arguments: { mock: true, seed },
  };
}

/** Core deterministic word-by-word generation loop shared by generate/stream. */
function runGeneration(req: GenerateRequest): MockGenOutcome {
  const params = req.params ?? {};
  const promptText = requestPromptText(req);
  const baseSeed = params.seed ?? hashString(promptText);
  const seed = combineSeed(baseSeed, req.model, params);
  const rng = mulberry32(seed);
  // Template/topic selection intentionally depends only on (baseSeed, model)
  // - NOT the full sampling params - so that varying temperature/topP/topK/
  // penalties changes WHICH WORDS get sampled without changing WHAT the
  // response is "about", mirroring how real decoding params only affect
  // token selection, never the underlying intent. The RNG above still mixes
  // in the full `params`, so two different sampling configs remain
  // independently deterministic and will genuinely diverge token-by-token.
  const templateSeed = combineSeed(baseSeed, req.model);

  const wantsTool =
    req.tools !== undefined && req.tools.length > 0 && params.toolChoice !== "none";
  if (wantsTool) {
    const toolCall = buildMockToolCall(req, seed);
    return { text: "", finishReason: "tool_calls", logprobs: [], tokenEvents: [], toolCall };
  }

  const wantsJson = Boolean(params.jsonMode || params.responseSchema);
  const topic = extractTopic(promptText);

  const words: string[] = wantsJson
    ? [
        "{",
        `"topic":`,
        `"${topic}",`,
        `"summary":`,
        `"a`,
        "deterministic",
        "mock",
        `answer",`,
        `"confidence":`,
        "0.82",
        "}",
      ]
    : selectTemplate(templateSeed).words.map((w) => w.replace("{topic}", topic));

  const maxTokens = params.maxTokens ?? words.length;
  const tokenCounts = new Map<string, number>();
  const outputWords: string[] = [];
  const logprobs: LogProb[] = [];
  const tokenEvents: ProviderStreamEvent[] = [];
  let finishReason: "stop" | "length" = "stop";

  for (let i = 0; i < words.length; i++) {
    if (outputWords.length >= maxTokens) {
      finishReason = "length";
      break;
    }
    const word = words[i]!;
    const isVariable = !wantsJson && i % 2 === 1;
    const candidates = buildCandidates(word, isVariable);
    const { index, logprob } = sampleCandidate(candidates, params, tokenCounts, rng);
    const chosen = candidates[index]!.token;
    tokenCounts.set(chosen, (tokenCounts.get(chosen) ?? 0) + 1);
    outputWords.push(chosen);
    logprobs.push(logprob);

    const pieceText = (outputWords.length === 1 ? "" : " ") + chosen;
    tokenEvents.push({ type: "token", token: pieceText, index: outputWords.length - 1 });
    tokenEvents.push({ type: "logprobs", logprobs: [logprob] });

    if (!wantsJson && params.stop && params.stop.length > 0) {
      const accumulated = outputWords.join(" ");
      if (params.stop.some((s) => s.length > 0 && accumulated.endsWith(s))) {
        finishReason = "stop";
        break;
      }
    }
  }

  return { text: outputWords.join(" "), finishReason, logprobs, tokenEvents };
}

/**
 * Deterministic, zero-key LLM provider. Same `(model, messages, params)`
 * (keyed on `params.seed ?? hash(prompt)`) always produces byte-identical
 * output. Genuinely temperature/top-p/top-k/penalty-aware: see
 * `sampling.ts`/`mock-corpus.ts` for the mechanics, and `mock.test.ts` for
 * the honesty tests (entropy/variation increases monotonically with temperature).
 */
export class MockProvider implements LLMProvider {
  readonly id = "mock" as const;

  async listModels() {
    return MODEL_CATALOG.filter((m) => m.providerId === "mock");
  }

  async countTokens(text: string, _model: string): Promise<number> {
    return countApproxTokens(text);
  }

  estimateCost(usage: TokenUsage, model: string): CostBreakdown {
    const info = findModel(model) ?? FALLBACK_MODEL;
    return estimateCostUsd(usage, info);
  }

  async embed(texts: string[], _model: string): Promise<number[][]> {
    return texts.map(embedText);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const start = Date.now();
    const outcome = runGeneration(req);
    const latencyMs = Math.max(Date.now() - start, 0);
    const usage = this.#usage(req, outcome.text);
    const cost = this.estimateCost(usage, req.model);
    return {
      text: outcome.text,
      toolCalls: outcome.toolCall ? [outcome.toolCall] : undefined,
      finishReason: outcome.finishReason,
      usage,
      cost,
      logprobs: outcome.logprobs.length > 0 ? outcome.logprobs : undefined,
      latencyMs,
    };
  }

  async *stream(req: GenerateRequest): AsyncIterable<ProviderStreamEvent> {
    const start = Date.now();
    const outcome = runGeneration(req);

    if (outcome.toolCall) {
      yield { type: "tool_call", toolCall: outcome.toolCall };
      const usage = this.#usage(req, "");
      const cost = this.estimateCost(usage, req.model);
      yield {
        type: "done",
        result: {
          text: "",
          toolCalls: [outcome.toolCall],
          finishReason: "tool_calls",
          usage,
          cost,
          latencyMs: Math.max(Date.now() - start, 0),
        },
      };
      return;
    }

    // Deterministic per-token delay (separate RNG stream so sampling stays
    // reproducible independent of timing): simulates measurable TTFT/tok-per-sec.
    const timingRng = mulberry32(combineSeed(hashString(requestPromptText(req)), "timing"));
    const streamDelayMs = Number(process.env.MOCK_STREAM_DELAY_MS ?? 4);

    for (const ev of outcome.tokenEvents) {
      if (ev.type === "token") {
        await delay(streamDelayMs > 0 ? 1 + Math.floor(timingRng() * streamDelayMs) : 0);
      }
      yield ev;
    }

    const usage = this.#usage(req, outcome.text);
    const cost = this.estimateCost(usage, req.model);
    yield {
      type: "done",
      result: {
        text: outcome.text,
        finishReason: outcome.finishReason,
        usage,
        cost,
        logprobs: outcome.logprobs.length > 0 ? outcome.logprobs : undefined,
        latencyMs: Math.max(Date.now() - start, 0),
      },
    };
  }

  #usage(req: GenerateRequest, outputText: string): TokenUsage {
    const inputTokens = countApproxTokens(requestPromptText(req));
    const outputTokens = countApproxTokens(outputText);
    return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
  }
}

/** Exposed for tests needing a fresh deterministic id without crypto randomness concerns. */
export function newMockRunId(): string {
  return `run_${randomUUID()}`;
}
