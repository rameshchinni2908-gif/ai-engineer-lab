import { randomUUID } from "node:crypto";
import type { ProviderId } from "@ail/shared";
import type { SseWriter } from "../../plugins/sse.js";
import { runGenerationOnce } from "../runs/generation.js";
import { insertRun } from "../runs/store.js";

export interface SyntheticDataRequest {
  seedExamples: Record<string, unknown>[];
  count: number;
  providerId: ProviderId;
  model: string;
  writer: SseWriter;
}

export interface SyntheticExample {
  index: number;
  example: Record<string, unknown>;
  runId: string;
  keptAfterFiltering: boolean;
  filteredReason?: "duplicate" | "too-short";
}

export interface SyntheticDataResult {
  runId: string;
  generated: SyntheticExample[];
  kept: Record<string, unknown>[];
}

const MIN_QUALITY_LENGTH = 8; // characters; a concrete, testable quality floor, not an arbitrary vibe check

function exampleText(example: Record<string, unknown>): string {
  return JSON.stringify(example);
}

/** Sum of string-valued fields' length - used for the quality floor so `{}`-wrapper overhead (quotes/braces/keys) never counts toward "content". */
function exampleContentLength(example: Record<string, unknown>): number {
  return Object.values(example)
    .filter((v): v is string => typeof v === "string")
    .reduce((sum, v) => sum + v.trim().length, 0);
}

/**
 * Pure dedup+quality filter pass, exported separately so the risk concepts
 * (mode collapse showing up as near-identical generations; a too-permissive
 * filter amplifying whatever bias is already in the seeds) are unit-testable
 * without needing a provider call.
 */
export function dedupeAndFilter(
  examples: { index: number; example: Record<string, unknown> }[],
): { index: number; example: Record<string, unknown>; keptAfterFiltering: boolean; filteredReason?: "duplicate" | "too-short" }[] {
  const seenTexts = new Set<string>();
  return examples.map(({ index, example }) => {
    const text = exampleText(example);
    if (exampleContentLength(example) < MIN_QUALITY_LENGTH) {
      return { index, example, keptAfterFiltering: false, filteredReason: "too-short" as const };
    }
    if (seenTexts.has(text)) {
      return { index, example, keptAfterFiltering: false, filteredReason: "duplicate" as const };
    }
    seenTexts.add(text);
    return { index, example, keptAfterFiltering: true };
  });
}

function tryParseJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through to the text-wrapper shape below
  }
  return { text };
}

/**
 * `POST /advanced/synthetic-data`. Generates `count` examples ONE AT A TIME
 * (each a real, separately-persisted `Run`, `feature: "synthetic-data-example"`),
 * emitting a `stage: "synthetic.example"` event per example as it completes,
 * then runs a real dedup + quality-filter pass (making mode collapse and
 * low-quality generations CONCRETELY VISIBLE as filtered-out entries, not
 * just an abstract warning) and emits one `stage: "synthetic.filtered"`
 * summary before the final wrapper `run_complete`.
 */
export async function runSyntheticDataGeneration(req: SyntheticDataRequest): Promise<SyntheticDataResult> {
  const seedText = req.seedExamples.map((s) => JSON.stringify(s)).join("\n");
  const raw: { index: number; example: Record<string, unknown>; runId: string }[] = [];

  for (let i = 0; i < req.count; i++) {
    const run = await runGenerationOnce({
      moduleId: "advanced",
      feature: "synthetic-data-example",
      providerId: req.providerId,
      model: req.model,
      messages: [
        {
          role: "user",
          content: `Generate one NEW synthetic example in the same style/shape as these seed examples (respond with a single JSON object, no commentary). Seed examples:\n${seedText}\n\n(Example index ${i})`,
        },
      ],
      params: { seed: i }, // distinct seed per index so the deterministic mock provider doesn't just repeat example 0 - keeps this demo meaningfully exercising dedup, not degenerate by construction
      metadata: { syntheticIndex: i },
    });

    const example = tryParseJson(run.output.text);
    raw.push({ index: i, example, runId: run.id });
    req.writer.send({
      type: "stage",
      runId: run.id,
      stage: "synthetic.example",
      data: { index: i, example },
    });
  }

  const filtered = dedupeAndFilter(raw.map(({ index, example }) => ({ index, example })));
  const generated: SyntheticExample[] = filtered.map((f, i) => ({
    index: f.index,
    example: f.example,
    runId: raw[i]!.runId,
    keptAfterFiltering: f.keptAfterFiltering,
    filteredReason: f.filteredReason,
  }));
  const kept = generated.filter((g) => g.keptAfterFiltering).map((g) => g.example);

  const droppedDuplicates = generated.filter((g) => g.filteredReason === "duplicate").length;
  const droppedTooShort = generated.filter((g) => g.filteredReason === "too-short").length;

  req.writer.send({
    type: "stage",
    runId: raw[0]?.runId ?? "synthetic-filter",
    stage: "synthetic.filtered",
    data: {
      requested: req.count,
      kept: kept.length,
      droppedDuplicates,
      droppedTooShort,
      note:
        droppedDuplicates > 0
          ? "Duplicate/near-duplicate outputs were dropped - this is mode collapse becoming visible: the generator produced the same content for different seeds/indices instead of diverse examples."
          : "No duplicates this run - that does not guarantee low mode-collapse risk at larger scale; recheck with a bigger count.",
    },
  });

  const wrapperRun = await insertRun({
    moduleId: "advanced",
    feature: "synthetic-data",
    providerId: req.providerId,
    model: req.model,
    params: {},
    input: { messages: [{ role: "user", content: `Generate ${req.count} synthetic examples from ${req.seedExamples.length} seeds` }] },
    output: { text: JSON.stringify(kept), parsedJson: kept },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, currency: "USD" },
    latencyMs: 0,
    status: "complete",
    tags: ["synthetic-data"],
    metadata: {
      requested: req.count,
      kept: kept.length,
      droppedDuplicates,
      droppedTooShort,
      perExampleRunIds: generated.map((g) => g.runId),
    },
    id: `run_${randomUUID()}`,
    completedAt: new Date().toISOString(),
  });

  return { runId: wrapperRun.id, generated, kept };
}
