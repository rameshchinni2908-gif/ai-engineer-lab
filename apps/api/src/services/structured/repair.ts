/**
 * M3 retry/repair loop (`POST /structured/repair` - contracts.md §4 M3).
 * Feeds the specific validation errors from a failed attempt back to the
 * model and asks it to fix them, capped at `maxAttempts`; each attempt is
 * its own persisted `Run` chained via `parentRunId`.
 */
import type { ProviderId } from "@ail/shared";
import { streamGeneration } from "../runs/generation.js";
import { updateRun } from "../runs/store.js";
import type { SseWriter } from "../../plugins/sse.js";
import { validateJson, type ValidationError, type ValidationResult } from "./schema-validator.js";

/** Pure: parses `text` as JSON and validates it against `schema`, never throwing on malformed JSON. */
export function validateCandidate(text: string, schema: unknown): ValidationResult {
  try {
    const value = JSON.parse(text);
    return validateJson(value, schema);
  } catch {
    return { valid: false, errors: [{ path: "$", message: "Invalid JSON syntax - could not be parsed at all" }] };
  }
}

/** Pure: builds the repair-attempt prompt, citing the SPECIFIC validation errors from the previous attempt. */
export function buildRepairPrompt(invalidText: string, schema: unknown, errors: ValidationError[]): string {
  const errorList = errors.map((e) => `- ${e.path || "$"}: ${e.message}`).join("\n");
  return `The following JSON failed schema validation.\n\nJSON:\n${invalidText}\n\nSchema:\n${JSON.stringify(schema)}\n\nValidation errors:\n${errorList}\n\nReturn ONLY the corrected JSON object - no commentary, no markdown fences.`;
}

export interface RunRepairLoopArgs {
  invalidJson: string;
  schema: unknown;
  providerId: ProviderId;
  model: string;
  maxAttempts?: number;
  writer: SseWriter;
}

/** Runs the capped repair loop, emitting one `repair.attempt` stage event per real attempt. */
export async function runRepairLoop(args: RunRepairLoopArgs): Promise<void> {
  const maxAttempts = Math.max(1, args.maxAttempts ?? 3);
  let currentText = args.invalidJson;
  let parentRunId: string | undefined;

  let validation = validateCandidate(currentText, args.schema);
  if (validation.valid) {
    args.writer.send({
      type: "stage",
      runId: `repair_noop_${Date.now()}`,
      stage: "repair.attempt",
      data: { attempt: 0, valid: true, errors: [] },
    });
    return;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const run = await streamGeneration({
      moduleId: "structured",
      feature: "repair.attempt",
      providerId: args.providerId,
      model: args.model,
      messages: [{ role: "user", content: buildRepairPrompt(currentText, args.schema, validation.errors) }],
      params: { jsonMode: true },
      writer: args.writer,
      parentRunId,
      tags: ["repair", `attempt-${attempt}`],
      metadata: { attempt },
    });

    currentText = run.output.text;
    validation = validateCandidate(currentText, args.schema);

    args.writer.send({
      type: "stage",
      runId: run.id,
      stage: "repair.attempt",
      data: { attempt, valid: validation.valid, errors: validation.errors },
    });

    if (validation.valid) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(currentText);
      } catch {
        parsedJson = undefined;
      }
      await updateRun(run.id, { output: { ...run.output, parsedJson } });
      return;
    }
    parentRunId = run.id;
  }
}
