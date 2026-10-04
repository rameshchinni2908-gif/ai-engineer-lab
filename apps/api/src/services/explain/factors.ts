import type { Difficulty, ExplainFactor, LogProb, Run } from "@ail/shared";

export interface LogProbStats {
  count: number;
  avgChosenProb: number;
  avgTopAltGap: number;
  minChosenProb: number;
  maxChosenProb: number;
}

/** Pure: summary statistics over a run's recorded `LogProb[]`, used to cite real numbers in `explainRun()`. */
export function computeLogprobStats(logprobs: LogProb[] | undefined): LogProbStats | undefined {
  if (!logprobs || logprobs.length === 0) return undefined;
  const chosenProbs = logprobs.map((lp) => Math.exp(lp.logprob));
  const gaps = logprobs.map((lp) => {
    const best = lp.topAlternatives[0];
    if (!best) return Math.exp(lp.logprob);
    return Math.exp(lp.logprob) - Math.exp(best.logprob);
  });
  return {
    count: logprobs.length,
    avgChosenProb: avg(chosenProbs),
    avgTopAltGap: avg(gaps),
    minChosenProb: Math.min(...chosenProbs),
    maxChosenProb: Math.max(...chosenProbs),
  };
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Pure: builds every `ExplainFactor`, each citing concrete numbers from THIS run (never generic text). */
export function buildFactors(run: Run, comparison?: Run): ExplainFactor[] {
  const factors: ExplainFactor[] = [];
  const stats = computeLogprobStats(run.logprobs);
  const temperature = run.params.temperature ?? 1;

  if (stats) {
    factors.push({
      label: "Temperature & sampling confidence",
      value: `temperature=${temperature}`,
      impact: temperature > 0.7 ? "increased" : temperature < 0.3 ? "decreased" : "neutral",
      detail:
        `At temperature ${temperature}, the ${stats.count} recorded tokens had an average ` +
        `chosen-token probability of ${pct(stats.avgChosenProb)} (ranging ${pct(stats.minChosenProb)}-${pct(stats.maxChosenProb)}), ` +
        `with the chosen token beating its best alternative by ${pct(Math.abs(stats.avgTopAltGap))} on average. ` +
        (temperature <= 1e-3
          ? "A temperature this low makes decoding effectively greedy, which is why this run is deterministic."
          : temperature > 1
            ? "A temperature above 1 flattens the distribution noticeably, which is why probability mass spreads across more alternatives."
            : "A moderate temperature keeps the distribution peaked but still leaves room for alternatives to be sampled."),
    });
  } else {
    factors.push({
      label: "Temperature",
      value: `temperature=${temperature}`,
      impact: "neutral",
      detail: `This run was configured with temperature=${temperature}, but the provider (${run.providerId}) did not return per-token logprobs for this call, so the actual sampled-probability spread cannot be measured directly.`,
    });
  }

  if (run.params.topP !== undefined || run.params.topK !== undefined) {
    factors.push({
      label: "Nucleus / top-k truncation",
      value: [
        run.params.topP !== undefined ? `topP=${run.params.topP}` : undefined,
        run.params.topK !== undefined ? `topK=${run.params.topK}` : undefined,
      ]
        .filter(Boolean)
        .join(", "),
      impact: "decreased",
      detail: `This run restricted sampling to ${
        run.params.topP !== undefined ? `the smallest set of candidates covering ${pct(run.params.topP)} cumulative probability` : ""
      }${run.params.topP !== undefined && run.params.topK !== undefined ? " and " : ""}${
        run.params.topK !== undefined ? `at most the top ${run.params.topK} candidates` : ""
      }, which narrows the candidate pool before sampling and makes the output less varied than temperature alone would produce.`,
    });
  }

  const finishReason = run.output.finishReason;
  if (finishReason === "length") {
    factors.push({
      label: "Finish reason: length",
      value: `maxTokens=${run.params.maxTokens ?? "default"}`,
      impact: "decreased",
      detail: `Generation stopped because the output reached the ${run.params.maxTokens ?? "model-default"}-token cap (finishReason="length") before naturally concluding, so the ${run.usage.outputTokens}-token output you see is truncated, not a natural stopping point.`,
    });
  } else if (run.params.stop && run.params.stop.length > 0) {
    factors.push({
      label: "Finish reason: stop sequence",
      value: `stop=[${run.params.stop.join(", ")}]`,
      impact: "neutral",
      detail: `This run was configured with ${run.params.stop.length} stop sequence(s) (${run.params.stop.join(", ")}); the ${run.usage.outputTokens}-token output ended at finishReason="${finishReason ?? "stop"}".`,
    });
  }

  const costDominant = run.cost.outputCostUsd >= run.cost.inputCostUsd ? "output" : "input";
  factors.push({
    label: "Token usage & cost",
    value: `$${run.cost.totalCostUsd.toFixed(6)}`,
    impact: "neutral",
    detail: `${run.usage.inputTokens} input + ${run.usage.outputTokens} output tokens on ${run.model} cost $${run.cost.inputCostUsd.toFixed(6)} + $${run.cost.outputCostUsd.toFixed(6)} = $${run.cost.totalCostUsd.toFixed(6)}; the ${costDominant} side dominates this run's cost.`,
  });

  if (run.ttftMs !== undefined || run.tokensPerSecond !== undefined) {
    factors.push({
      label: "Latency profile",
      value: `${run.latencyMs}ms total`,
      impact: "neutral",
      detail: `Total latency was ${run.latencyMs}ms${run.ttftMs !== undefined ? `, with ${run.ttftMs}ms to first token (TTFT)` : ""}${run.tokensPerSecond !== undefined ? ` and a sustained ${run.tokensPerSecond.toFixed(1)} tokens/sec thereafter` : ""}.`,
    });
  }

  if (run.output.toolCalls && run.output.toolCalls.length > 0) {
    factors.push({
      label: "Tool calls",
      value: `${run.output.toolCalls.length} call(s)`,
      impact: "neutral",
      detail: `The model issued ${run.output.toolCalls.length} tool call(s): ${run.output.toolCalls.map((t) => t.name).join(", ")}.`,
    });
  }

  if (run.status === "error") {
    factors.push({
      label: "Run failed",
      value: "status=error",
      impact: "decreased",
      detail: `This run ended in an error: "${run.error ?? "unknown error"}".`,
    });
  }

  if (comparison) {
    const tempDelta = (run.params.temperature ?? 1) - (comparison.params.temperature ?? 1);
    const costDelta = run.cost.totalCostUsd - comparison.cost.totalCostUsd;
    const latencyDelta = run.latencyMs - comparison.latencyMs;
    factors.push({
      label: `Comparison vs run ${comparison.id}`,
      value: `Δtemperature=${tempDelta.toFixed(2)}`,
      impact: tempDelta > 0 ? "increased" : tempDelta < 0 ? "decreased" : "neutral",
      detail: `Compared to run ${comparison.id} (temperature=${comparison.params.temperature ?? 1}), this run's temperature differs by ${tempDelta.toFixed(2)}, cost differs by $${costDelta.toFixed(6)}, and latency differs by ${latencyDelta}ms.`,
    });
  }

  return factors;
}

/** Pure: concrete, run-specific "what to try next" suggestions. */
export function buildWhatToTryNext(run: Run): string[] {
  const suggestions: string[] = [];
  const temperature = run.params.temperature ?? 1;

  if (temperature <= 1e-3) {
    suggestions.push(
      `Raise temperature above 0 (try 0.7-1.0) and re-run with the same seed to see the ${run.usage.outputTokens}-token output and its logprobs actually vary.`,
    );
  } else if (temperature > 1.2) {
    suggestions.push(
      `Temperature ${temperature} is quite high; try 0.6-0.8 with topP around 0.9 to keep output coherent while still sampling.`,
    );
  }

  if (run.output.finishReason === "length") {
    suggestions.push(
      `Increase maxTokens above ${run.params.maxTokens ?? "its current value"} so the model can finish naturally instead of being cut off.`,
    );
  }

  if (run.params.topP === undefined && run.params.topK === undefined && temperature > 0.8) {
    suggestions.push("Add a topP (e.g. 0.9) or topK to bound the tail of the distribution at this temperature.");
  }

  if (run.cost.totalCostUsd > 0.01) {
    suggestions.push(
      `This run cost $${run.cost.totalCostUsd.toFixed(4)}; try a cheaper model for ${run.moduleId}/${run.feature} and compare via Run Compare.`,
    );
  }

  if (suggestions.length === 0) {
    suggestions.push(`Try changing one parameter at a time (e.g. temperature or maxTokens) and re-run to see the effect on this run's ${run.usage.outputTokens}-token output.`);
  }

  return suggestions;
}

/** Pure: difficulty-aware prose summary built from the already-computed factors (no generic boilerplate). */
export function buildSummary(run: Run, difficulty: Difficulty, factors: ExplainFactor[]): string {
  const headline = factors[0]?.detail ?? `Run ${run.id} completed with status ${run.status}.`;

  if (difficulty === "beginner") {
    return `This run asked ${run.model} to respond with temperature ${run.params.temperature ?? 1}. It produced ${run.usage.outputTokens} tokens of output in ${run.latencyMs}ms, costing $${run.cost.totalCostUsd.toFixed(6)}. ${headline}`;
  }
  if (difficulty === "senior") {
    return `Run ${run.id} (${run.providerId}/${run.model}, feature=${run.feature}): temperature=${run.params.temperature ?? 1}, topP=${run.params.topP ?? "unset"}, topK=${run.params.topK ?? "unset"}, finishReason=${run.output.finishReason ?? "n/a"}. ${headline} usage=${run.usage.inputTokens}in/${run.usage.outputTokens}out tok, cost=$${run.cost.totalCostUsd.toFixed(6)}, latency=${run.latencyMs}ms${run.ttftMs !== undefined ? ` (ttft=${run.ttftMs}ms)` : ""}.`;
  }
  return `Run ${run.id} on ${run.model} (temperature ${run.params.temperature ?? 1}) finished in ${run.latencyMs}ms with ${run.usage.outputTokens} output tokens ($${run.cost.totalCostUsd.toFixed(6)}). ${headline}`;
}
