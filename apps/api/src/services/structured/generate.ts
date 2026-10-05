/**
 * M3 "three modes compared" (`POST /structured/generate` - contracts.md §4
 * M3): free-text JSON prompting (json_mode) vs schema-constrained decoding
 * vs forced-tool calling, all driving the SAME underlying `streamGeneration`
 * so cost/latency/validity are directly comparable across modes.
 */
import type { GenerationParams, Message, ProviderId, ToolDefinition } from "@ail/shared";
import { streamGeneration } from "../runs/generation.js";
import { updateRun } from "../runs/store.js";
import type { SseWriter } from "../../plugins/sse.js";
import { validateJson } from "./schema-validator.js";

export type StructuredMode = "json_mode" | "schema_constrained" | "forced_tool";

export interface StructuredGenerateArgs {
  mode: StructuredMode;
  providerId: ProviderId;
  model: string;
  messages: Message[];
  responseSchema?: unknown;
  params?: GenerationParams;
  writer: SseWriter;
}

/** Pure: builds the single synthetic tool used by `forced_tool` mode from the target schema. */
export function buildForcedResultTool(responseSchema: unknown): ToolDefinition {
  return {
    name: "emit_result",
    description: "Emit the final structured result. Arguments MUST match the required schema exactly.",
    inputSchema: responseSchema ?? {},
    category: "other",
  };
}

/** Pure: attempts to extract the "candidate JSON" a completed run produced, per mode. Never throws. */
export function extractCandidateJson(
  mode: StructuredMode,
  output: { text: string; toolCalls?: { arguments?: unknown }[] },
): { parsed: boolean; value: unknown } {
  if (mode === "forced_tool") {
    const call = output.toolCalls?.[0];
    return call ? { parsed: true, value: call.arguments } : { parsed: false, value: undefined };
  }
  try {
    return { parsed: true, value: JSON.parse(output.text) };
  } catch {
    return { parsed: false, value: undefined };
  }
}

/** Runs one of the three structured-generation modes and emits a `structured.parsed` stage event with the validation outcome. */
export async function runStructuredGenerate(args: StructuredGenerateArgs): Promise<void> {
  let params: GenerationParams = { ...args.params };
  let tools: ToolDefinition[] | undefined;
  let system: string | undefined;

  if (args.mode === "json_mode") {
    params = { ...params, jsonMode: true };
  } else if (args.mode === "schema_constrained") {
    params = { ...params, jsonMode: true, responseSchema: args.responseSchema };
    if (args.responseSchema) {
      system = `Respond with ONLY a JSON object matching this schema: ${JSON.stringify(args.responseSchema)}`;
    }
  } else {
    tools = [buildForcedResultTool(args.responseSchema)];
    params = { ...params, toolChoice: "required" };
  }

  const run = await streamGeneration({
    moduleId: "structured",
    feature: `generate.${args.mode}`,
    providerId: args.providerId,
    model: args.model,
    messages: args.messages,
    system,
    params,
    tools,
    writer: args.writer,
    tags: ["structured-generate", args.mode],
  });

  const { parsed, value } = extractCandidateJson(args.mode, run.output);
  const validation = parsed && args.responseSchema !== undefined ? validateJson(value, args.responseSchema) : undefined;

  if (parsed) {
    await updateRun(run.id, { output: { ...run.output, parsedJson: value } });
  }

  args.writer.send({
    type: "stage",
    runId: run.id,
    stage: "structured.parsed",
    data: { mode: args.mode, parsed, parsedJson: value, valid: validation?.valid, errors: validation?.errors },
  });
}
