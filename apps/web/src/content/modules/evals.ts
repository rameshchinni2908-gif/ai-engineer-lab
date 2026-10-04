import type { ModuleContent } from "../types";

export const evalsContent: ModuleContent = {
  moduleId: "evals",
  learn: {
    moduleId: "evals",
    summary: {
      beginner:
        "Evals are how you measure whether a prompt or model is actually good, using a consistent set of test cases, instead of just eyeballing a few examples and guessing.",
      intermediate:
        "LLM-as-judge scales evaluation far beyond what manual review can sustain, but it inherits real biases (position, verbosity, self-enhancement) that need explicit mitigation. Regression gating turns eval scores into an enforced quality bar on every prompt/model change, the same way test coverage gates code changes.",
      senior:
        "An eval pipeline is only as trustworthy as its judge's validated agreement with human judgment and its dataset's continued representativeness of real traffic — an eval suite that passed at launch and was never refreshed or re-validated against drifted production data is a false sense of security, not a safety net.",
    },
    explain: [
      {
        heading: "A golden dataset turns 'seems better' into a measurable claim",
        body: "Running the same fixed set of input/expected-output cases against two prompt versions produces directly comparable scores — that comparability is the entire basis for deciding whether a change is actually an improvement, not a guess based on a handful of manually-reviewed examples.",
      },
      {
        heading: "LLM-as-judge scales, but it has documented biases",
        body: "A judge model can favor longer responses (verbosity bias), whichever response is listed first (position bias), or outputs from its own model family (self-enhancement bias) — all independent of actual quality. This app's eval runner persists every judge call as its own `Run` (via `judgeRunId`) specifically so judge cost, latency, and behavior are visible and auditable, not hidden inside an opaque score.",
      },
      {
        heading: "Regression gating makes quality bars enforceable, not aspirational",
        body: "`/evals/ci-check` compares a suite result against explicit per-metric thresholds and returns pass/fail with the specific failing metric, variant, and score — the same mechanism backs both the in-app banner and a CI script that can fail a build, turning 'we should check eval scores before deploying' into something that actually happens automatically.",
      },
    ],
    underTheHood: [
      {
        heading: "Every case×variant call and every judge call is its own persisted Run",
        body: "`/evals/run` streams `progress` events shaped like 'case i/N, variant j/M', and under the hood, each individual LLM call (the thing being evaluated) and each judge call is a separately persisted `Run` — the final `EvalSuiteResult` aggregates these, but nothing about the aggregation is opaque; you can drill into any single case's actual call.",
      },
      {
        heading: "Faithfulness, answer relevance, and context precision/recall are measured independently",
        body: "A RAG-specific eval suite scores retrieval-stage quality (context precision/recall: were the right chunks retrieved?) separately from generation-stage quality (faithfulness, answer relevance: did the model use them well?) — this separation is what lets you tell whether to invest in a better retriever or a better generation prompt when answers go wrong.",
      },
      {
        heading: "CSV import maps columns to EvalCase fields via a header row convention",
        body: "`/evals/datasets/:id/import` with `format: 'csv'` expects header-row columns that map to `EvalCase.input.*`/`expected` — this keeps dataset authoring accessible to non-engineers using a spreadsheet, while still producing the same structured `EvalCase` shape the runner expects.",
      },
    ],
    seniorGotchas: [
      {
        heading: "An unvalidated judge model is just another opaque black box",
        body: "Treating LLM-judge scores as ground truth without ever checking them against human judgment on a sample defeats the purpose of having a measurable eval — validate inter-annotator agreement between the judge and real humans before trusting the judge's scores to gate deploys.",
      },
      {
        heading: "Position bias can flip a pairwise verdict by itself",
        body: "The standard mitigation — running every pairwise comparison twice with response order swapped — exists because position bias is strong enough to change which response 'wins' purely based on which slot it's shown in. Skipping this check means some fraction of your pairwise results are artifacts of ordering, not quality.",
      },
      {
        heading: "A golden dataset frozen since launch stops representing real traffic",
        body: "An eval suite that was comprehensive at launch can quietly lose relevance as real production queries drift away from what the dataset covers — periodic refresh from actual production failures/edge cases is necessary, not optional maintenance.",
      },
      {
        heading: "Self-enhancement bias corrupts cross-provider comparisons specifically",
        body: "Using a judge from the same model family as one of the candidates being compared systematically favors that candidate — any eval comparing models across providers needs a judge from a third, unrelated family (or multi-judge triangulation), or the comparison isn't actually fair.",
      },
    ],
  },
  pitfalls: [
    {
      id: "evals-unvalidated-judge",
      title: "LLM-judge scores are trusted without ever checking against human judgment",
      symptom: "An eval dashboard shows consistently high scores, but users report quality that doesn't match.",
      cause: "The judge model's scoring was never validated against a human-labeled sample, so systematic judge bias (verbosity, leniency, or misunderstanding the rubric) went undetected.",
      fix: "Periodically sample judge-scored cases and have a human re-score them; track inter-annotator agreement between judge and human, and revise the rubric or judge model if agreement is low.",
      severity: "high",
    },
    {
      id: "evals-position-bias-unmitigated",
      title: "Pairwise comparison results are inconsistent when inputs are reordered",
      symptom: "Swapping which response is labeled 'A' versus 'B' changes which one the judge prefers, for the same underlying content.",
      cause: "Position bias wasn't mitigated — each comparison was only run once in a single order, so some fraction of 'preferred' verdicts are artifacts of ordering, not actual quality differences.",
      fix: "Run every pairwise comparison twice with order swapped and discard (or flag as inconclusive) any case where the verdict flips with the order.",
      severity: "medium",
    },
    {
      id: "evals-stale-golden-dataset",
      title: "Eval scores stay high while real user complaints increase",
      symptom: "The golden dataset consistently shows passing scores, but production quality complaints are rising.",
      cause: "The dataset was never refreshed after launch and no longer represents the distribution of real production queries — it's testing against an increasingly outdated slice of the problem space.",
      fix: "Periodically mine real production failures/edge cases into the golden dataset, and track dataset-to-production drift as its own signal, not just the eval score itself.",
      severity: "high",
    },
    {
      id: "evals-cross-provider-self-enhancement",
      title: "A model comparison across providers consistently favors one provider",
      symptom: "An A/B eval comparing Model X and Model Y always ranks Model X higher, even on cases where manual review disagrees.",
      cause: "The judge model used to score the comparison came from the same provider/family as Model X, triggering self-enhancement bias in the judge's scoring.",
      fix: "Use a judge model from a third, unrelated provider/family for any cross-provider comparison, or triangulate with multiple judges and a human-reviewed sample.",
      severity: "high",
    },
  ],
  quiz: [
    {
      id: "evals-q1",
      question: "What is the primary purpose of a golden dataset in an eval pipeline?",
      options: [
        "To store the model's training data",
        "To provide a fixed, consistent set of cases so two prompt/model versions can be compared on genuinely equal footing",
        "To automatically fix bad prompts without human review",
        "To replace the need for any LLM-as-judge scoring",
      ],
      correctIndex: 1,
      explanation: "A golden dataset's value comes entirely from consistency: running the identical cases against two variants produces comparable scores, which is what makes 'is this actually better' a measurable question instead of a subjective impression.",
      difficulty: "beginner",
    },
    {
      id: "evals-q2",
      question: "Why does running a pairwise comparison twice with response order swapped matter?",
      options: [
        "It doubles the judge's confidence score automatically",
        "Position bias can cause a judge to favor whichever response is shown first (or second), so swapping and comparing results detects and filters out order-driven false verdicts",
        "It's required by the API and has no effect on result quality",
        "It only matters when using human judges, never LLM judges",
      ],
      correctIndex: 1,
      explanation: "Position bias is well-documented across judge models — the preferred response can flip purely based on presentation order. Running both orders and checking for agreement is the standard way to detect and discard order-driven, non-quality-based verdicts.",
      difficulty: "intermediate",
    },
    {
      id: "evals-q3",
      question: "A RAG eval shows low context precision but high faithfulness. What does this combination suggest?",
      options: [
        "The retriever is pulling in some irrelevant chunks, but the generator is doing a good job of being faithful to whatever it did retrieve",
        "The generator is hallucinating heavily despite good retrieval",
        "This combination is impossible to observe in practice",
        "The eval metrics are miscalibrated and should be ignored",
      ],
      correctIndex: 0,
      explanation: "Context precision and faithfulness measure different stages: precision is about whether retrieved chunks are relevant (retrieval-stage), faithfulness is about whether the generated answer sticks to what was retrieved (generation-stage). Low precision with high faithfulness points to a retrieval-tuning problem, not a generation problem.",
      difficulty: "senior",
    },
    {
      id: "evals-q4",
      question: "Why is self-enhancement bias a specific concern when comparing models from different providers using an LLM judge?",
      options: [
        "It isn't a real concern — judges are provider-agnostic by design",
        "A judge model tends to rate outputs from its own model family more favorably, which skews cross-provider comparisons unless the judge is from a third, unrelated family",
        "Self-enhancement bias only affects single-model evaluations, never comparisons",
        "It only matters when the dataset has fewer than 10 cases",
      ],
      correctIndex: 1,
      explanation: "Using a judge from the same family as one of the compared models introduces a systematic thumb on the scale favoring that model. A fair cross-provider comparison needs a judge model with no family relationship to any candidate being compared.",
      difficulty: "senior",
    },
    {
      id: "evals-q5",
      question: "Why does this app persist each case×variant LLM call and each judge call as its own separate Run inside an eval suite result?",
      options: [
        "To make the eval UI load more slowly on purpose",
        "So every individual call's actual cost, latency, and output is independently inspectable, letting you drill into exactly which case or which judge call drove a given score",
        "Because the SSE protocol requires one Run per token streamed",
        "Only for storage redundancy, with no debugging benefit",
      ],
      correctIndex: 1,
      explanation: "An eval suite result aggregates many individual calls. Persisting each one as its own Run (with judgeRunId linking judge calls to what they evaluated) means nothing about the final aggregate score is a black box — any specific case or judgment can be inspected directly.",
      difficulty: "intermediate",
    },
  ],
  presets: [
    {
      id: "evals-two-prompt-versions",
      label: "Compare prompt v1 vs v2 on the same golden dataset",
      description: "Run two versions of the same prompt against an identical dataset and metric set, and compare scores side by side with a regression-gate check.",
    },
    {
      id: "evals-judge-position-bias-check",
      label: "Pairwise comparison with and without order-swap mitigation",
      description: "Run the same pairwise comparison in both orderings and see how often the verdict flips purely due to position.",
    },
    {
      id: "evals-rag-metric-breakdown",
      label: "Full RAG metric breakdown: precision, recall, faithfulness, relevance",
      description: "Run a RAG-specific eval suite and inspect all four metrics separately to see whether a known bad answer is a retrieval or generation problem.",
    },
    {
      id: "evals-ci-gate-demo",
      label: "A regression that fails the CI gate",
      description: "Deliberately introduce a prompt regression, run the eval suite, and watch `/evals/ci-check` report the specific failing metric, variant, and threshold.",
    },
  ],
};
