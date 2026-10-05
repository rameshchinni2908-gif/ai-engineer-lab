export type DataVolume = "small" | "medium" | "large";
export type LatencyBudget = "tight" | "moderate" | "relaxed";
export type CostCeiling = "low" | "medium" | "high";
export type DriftRate = "stable" | "occasional" | "frequent";

export interface AdaptationInputs {
  dataVolume: DataVolume;
  latencyBudget: LatencyBudget;
  costCeiling: CostCeiling;
  driftRate: DriftRate;
}

export type AdaptationTechnique = "prompting" | "rag" | "lora" | "fine-tune" | "distillation";

export interface AdaptationScore {
  technique: AdaptationTechnique;
  score: number;
  reasons: string[];
}

export interface AdaptationRecommendation {
  scores: AdaptationScore[];
  recommended: AdaptationTechnique;
  rationale: string;
}

/**
 * Pure scoring heuristic (no backend route, per contracts.md §4 M10 - this
 * is a decision framework applied to the user's own inputs, computed
 * entirely client-side). Each technique accumulates points per axis with a
 * stated reason, so the recommendation is traceable, not a black box.
 */
export function scoreAdaptationTechniques(inputs: AdaptationInputs): AdaptationRecommendation {
  const scores: AdaptationScore[] = [
    { technique: "prompting", score: 0, reasons: [] },
    { technique: "rag", score: 0, reasons: [] },
    { technique: "lora", score: 0, reasons: [] },
    { technique: "fine-tune", score: 0, reasons: [] },
    { technique: "distillation", score: 0, reasons: [] },
  ];
  const byId = Object.fromEntries(scores.map((s) => [s.technique, s])) as Record<AdaptationTechnique, AdaptationScore>;

  function add(t: AdaptationTechnique, points: number, reason: string): void {
    byId[t].score += points;
    byId[t].reasons.push(reason);
  }

  // Data volume: prompting/RAG need none; fine-tune/distillation need real volume.
  if (inputs.dataVolume === "small") {
    add("prompting", 2, "Small data volume favors prompting - no training data pipeline needed at all.");
    add("rag", 2, "Small data volume still works with RAG - indexing a handful of documents is cheap.");
    add("fine-tune", -2, "Small data volume is a poor fit for fine-tuning, which needs a real training set to avoid overfitting.");
    add("distillation", -2, "Small data volume is a poor fit for distillation, which needs enough examples to transfer behavior reliably.");
  } else if (inputs.dataVolume === "medium") {
    add("lora", 1, "Medium data volume is enough for a LoRA adapter without a full fine-tune's data appetite.");
    add("rag", 1, "Medium data volume indexes fine for RAG.");
  } else {
    add("fine-tune", 2, "Large data volume is exactly what fine-tuning needs to reliably ingrain a behavior.");
    add("lora", 2, "Large data volume supports a well-trained LoRA adapter.");
    add("distillation", 2, "Large data volume supports distilling a smaller model without starving it of examples.");
  }

  // Latency budget: tight favors smaller/cheaper paths (distillation, fine-tuned/LoRA small model); RAG/long prompts add latency.
  if (inputs.latencyBudget === "tight") {
    add("distillation", 3, "A tight latency budget favors distillation to a smaller, faster model.");
    add("lora", 1, "A tight latency budget favors a LoRA-adapted smaller base model over adding retrieval latency.");
    add("rag", -1, "A tight latency budget is a real cost for RAG, which adds a retrieval round-trip before generation.");
  } else if (inputs.latencyBudget === "relaxed") {
    add("rag", 1, "A relaxed latency budget comfortably absorbs RAG's extra retrieval step.");
    add("prompting", 1, "A relaxed latency budget tolerates longer few-shot prompts if needed.");
  }

  // Cost ceiling: low cost favors prompting/RAG (no training cost); high cost ceiling unlocks fine-tune/distillation investment.
  if (inputs.costCeiling === "low") {
    add("prompting", 2, "A low cost ceiling favors prompting - zero training cost.");
    add("rag", 1, "A low cost ceiling still affords RAG's indexing cost, which is far cheaper than training.");
    add("fine-tune", -2, "A low cost ceiling is a poor fit for fine-tuning's real training compute cost.");
  } else if (inputs.costCeiling === "high") {
    add("fine-tune", 1, "A high cost ceiling affords fine-tuning's training compute.");
    add("distillation", 1, "A high cost ceiling affords the upfront cost of producing a distilled model.");
  }

  // Drift rate: frequent drift strongly favors RAG (no retraining needed); stable favors fine-tune/LoRA (ingrain once).
  if (inputs.driftRate === "frequent") {
    add("rag", 3, "Frequently changing/drifting knowledge is RAG's strongest case - fresh retrieval beats repeated retraining.");
    add("fine-tune", -3, "Frequent drift makes fine-tuning a poor fit - you'd be re-training constantly to chase changing facts.");
    add("lora", -1, "Frequent drift also undercuts a LoRA adapter's useful lifetime for knowledge-freshness needs specifically.");
  } else if (inputs.driftRate === "stable") {
    add("fine-tune", 2, "Stable, non-drifting knowledge/behavior is exactly what fine-tuning is good at ingraining durably.");
    add("lora", 2, "Stable behavior needs are a good fit for a LoRA adapter trained once.");
  }

  const ordered = [...scores].sort((a, b) => b.score - a.score);
  const recommended = ordered[0]!.technique;
  const top = byId[recommended];
  const rationale =
    top.reasons.length > 0
      ? `Recommended: ${recommended}. ${top.reasons.join(" ")}`
      : `Recommended: ${recommended} (no strong signal either way from these inputs - treat this as a starting hypothesis, not a final answer).`;

  return { scores: ordered, recommended, rationale };
}
