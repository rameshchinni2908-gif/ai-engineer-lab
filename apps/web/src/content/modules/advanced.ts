import type { ModuleContent } from "../types";

export const advancedContent: ModuleContent = {
  moduleId: "advanced",
  learn: {
    moduleId: "advanced",
    summary: {
      beginner:
        "This module covers topics beyond everyday prompting: how models are adapted after initial training (fine-tuning, LoRA, RLHF/DPO), how they're shrunk to run faster (quantization), models that can see images, and models that can 'think longer' before answering.",
      intermediate:
        "Attention heatmaps and quantization figures shown here are clearly-labeled illustrative approximations, not real internals or authoritative benchmarks — hosted providers don't expose real attention weights, and specific quality/speed trade-offs vary by model and should be measured, not assumed from a diagram.",
      senior:
        "The adaptation decision (prompt/RAG vs. fine-tune vs. LoRA vs. distill) is an engineering trade-off between knowledge freshness, cost, latency, and how deeply a behavior needs to be ingrained — not a maturity ladder where fine-tuning is always the 'more advanced' or 'better' choice. Reasoning models and thinking budgets trade real compute for (usually, not always) better multi-step performance, and that trade-off needs task-specific measurement, not a blanket policy.",
    },
    explain: [
      {
        heading: "The attention heatmap here is illustrative, not the model's real internals",
        body: "`/advanced/attention-heatmap` computes a positional-distance and token-similarity heuristic, clearly disclosed as 'simulated, for intuition only' — hosted provider APIs (Anthropic/OpenAI) do not expose real attention weights, and this applies even to the mock provider. It builds genuine intuition for what attention does conceptually, but it is never the model's actual internal computation.",
      },
      {
        heading: "Quantization trades precision for memory and speed, illustratively here",
        body: "`/advanced/quantization-demo` returns order-of-magnitude illustrative figures (approximate size, approximate latency factor, qualitative notes) for fp16/int8/int4 — explicitly not an authoritative benchmark. Real quantization impact varies by model architecture and task; precision-sensitive tasks (exact arithmetic, subtle code logic) tend to degrade more than fluent free text.",
      },
      {
        heading: "Reasoning presets are just a thinking-budget parameter on the existing sampling lab",
        body: "`/advanced/reasoning-presets` only returns preset metadata (id/name/model/budget) — actually running one reuses M1's `/fundamentals/sample` with `params.thinkingBudget` set from the preset. There's no separate generation route here, because thinking budget is just one more generation parameter, not a fundamentally different pipeline.",
      },
    ],
    underTheHood: [
      {
        heading: "Synthetic data generation streams one example at a time, for real",
        body: "`/advanced/synthetic-data` emits a `stage` event per generated example (`synthetic.example`) before the final `run_complete` carries the full array in `output.parsedJson` — letting you watch generation quality and diversity emerge example by example, not just see a finished batch.",
      },
      {
        heading: "Multimodal demo gates on documented model capability, not a guess",
        body: "`/advanced/multimodal-demo` returns 422 if the selected model's `ModelInfo.supportsVision` is false — vision support is a per-model documented fact, not something to assume based on a model family's general reputation.",
      },
      {
        heading: "The pretrain → SFT → RLHF/DPO pipeline is a sequence of distinct training objectives",
        body: "Pretraining learns general language patterns via next-token prediction over a huge corpus; SFT teaches instruction-following behavior from curated examples; RLHF/DPO further aligns output with human preference via comparison data. Each stage uses a genuinely different training signal and objective — it isn't one continuous process with different names for the same thing.",
      },
    ],
    seniorGotchas: [
      {
        heading: "Never present the attention heatmap as the model's real computation",
        body: "Because it's a heuristic approximation (positional distance + token similarity) rather than extracted real weights, drawing confident conclusions about 'what the model is actually focusing on' from this visualization — for any provider, including mock — is not justified. Use it only to build intuition for the general concept of attention.",
      },
      {
        heading: "Quantization quality loss is architecture- and task-dependent, not a fixed percentage",
        body: "A specific 'retains 98% of quality at int8' style claim seen elsewhere should be treated as specific to that benchmark, model, and task — not a universal figure to carry into a different model or a different, more precision-sensitive task without separately measuring it.",
      },
      {
        heading: "Thinking budgets have diminishing and sometimes negative returns past a task-dependent point",
        body: "More 'thinking' tokens cost real latency and money, and past a certain point for a given task, extra budget doesn't reliably improve the answer and can even introduce new failure modes (overthinking simple problems into wrong answers). Tune budgets empirically per task, not by assuming more is always better.",
      },
      {
        heading: "The RAG vs. fine-tune vs. LoRA vs. distill decision is about the actual constraint, not a hierarchy",
        body: "RAG wins when knowledge needs to stay fresh/private without retraining; fine-tuning wins when a behavior needs to be deeply ingrained beyond what in-context learning reliably achieves; LoRA wins when you need many cheap task-specific variants of one base model; distillation wins when you need a much cheaper model for a narrow, well-covered task. Treat this as a decision tree based on actual constraints, not a 'more advanced technique is always better' ladder.",
      },
    ],
  },
  pitfalls: [
    {
      id: "advanced-attention-heatmap-overtrust",
      title: "A heatmap visualization is cited as evidence for 'what the model actually attended to'",
      symptom: "A debugging writeup claims a specific real cause for a model's behavior based on the attention heatmap demo.",
      cause: "The heatmap is a disclosed heuristic approximation (positional distance + token similarity), not extracted real attention weights from any provider, including mock — it was mistaken for ground truth.",
      fix: "Use the heatmap only for building conceptual intuition about what attention does; never cite it as evidence for a specific model's real internal computation in a debugging or research claim.",
      severity: "medium",
    },
    {
      id: "advanced-quantization-benchmark-assumed",
      title: "A specific quantization quality-retention number is applied to an unrelated model/task",
      symptom: "A decision to ship int4 quantization cites a quality-retention percentage that turns out not to hold for the actual deployed model and task.",
      cause: "The quantization-demo's illustrative order-of-magnitude figures (or a similar figure from elsewhere) were treated as an authoritative, portable benchmark rather than a model/task-specific measurement that needs to be redone for the real deployment target.",
      fix: "Treat any quantization quality figure as illustrative until validated on the actual model and task being shipped — benchmark the real deployment configuration directly rather than reusing a number from a different model or demo.",
      severity: "medium",
    },
    {
      id: "advanced-thinking-budget-overspend",
      title: "Raising the thinking budget to maximum doesn't improve (or worsens) answer quality",
      symptom: "A task's accuracy plateaus or even drops after increasing the reasoning model's thinking budget well past a moderate setting.",
      cause: "The task didn't benefit from more deliberation past a certain point, but the budget was increased based on an assumption that 'more thinking is always better' rather than empirical testing.",
      fix: "Sweep thinking budget values against your actual task's eval set and pick the setting that actually maximizes quality-per-cost, rather than defaulting to the maximum available budget.",
      severity: "low",
    },
    {
      id: "advanced-finetune-over-rag",
      title: "Fine-tuning is chosen for a knowledge-freshness problem that RAG would have solved more cheaply",
      symptom: "A team fine-tunes a model to 'know about' frequently-changing internal documentation, then has to re-fine-tune every time the docs change.",
      cause: "The actual problem was knowledge freshness/access, which RAG solves without retraining — fine-tuning was chosen based on it feeling like the more 'advanced' or thorough solution, not based on matching the technique to the actual constraint.",
      fix: "Diagnose whether the real need is fresh/private knowledge access (favors RAG) versus a deeply ingrained behavior/style/format change (favors fine-tuning/LoRA) before choosing an adaptation technique, and default to the cheaper, no-retraining option when it matches the actual need.",
      severity: "medium",
    },
  ],
  quiz: [
    {
      id: "advanced-q1",
      question: "Why does this app's attention-heatmap feature explicitly disclose itself as 'simulated, for intuition only'?",
      options: [
        "Because real attention weights are too large to display in a browser",
        "Because hosted provider APIs don't expose real attention weights, so the visualization is a heuristic approximation rather than the model's actual internal computation — for every provider, including mock",
        "Because attention heatmaps are only valid for image models, not text",
        "Because the feature is planned but not yet implemented",
      ],
      correctIndex: 1,
      explanation: "Real attention weights aren't exposed by hosted provider APIs, so any 'attention visualization' against a real model has to be an approximation. This app is explicit about that limitation rather than presenting a heuristic as if it were ground truth — a distinction that matters for any claim built on top of it.",
      difficulty: "intermediate",
    },
    {
      id: "advanced-q2",
      question: "A blog post claims 'int8 quantization retains 98% of model quality.' What's the senior-level response to this claim?",
      options: [
        "Accept it as a universal fact applicable to any model and task",
        "Treat it as specific to that benchmark's model and task, and measure quality retention directly on your own model and task before relying on it",
        "Assume it only applies to int4, not int8, and adjust accordingly",
        "Reject it outright as definitely false",
      ],
      correctIndex: 1,
      explanation: "Quantization's quality impact is architecture- and task-dependent — a retention figure from one model/task combination doesn't transfer reliably to a different one, especially for precision-sensitive tasks. The correct response is to measure it on your actual deployment target, not to treat any single number as universal.",
      difficulty: "senior",
    },
    {
      id: "advanced-q3",
      question: "Why is there no separate '/advanced' generation route for running a reasoning preset?",
      options: [
        "Because reasoning presets don't actually run anything",
        "Because thinking budget is just one more GenerationParams field, and M1's `/fundamentals/sample` already streams against arbitrary params — a separate route would duplicate that plumbing with no behavioral difference",
        "Because reasoning models require a completely different SSE protocol",
        "Because the advanced module has no backend routes at all",
      ],
      correctIndex: 1,
      explanation: "The architecture deliberately avoids duplicating generation code: thinking budget is one more tunable parameter on the same generation pipeline M1 already built, so reusing `/fundamentals/sample` with `params.thinkingBudget` set from the preset is the correct design, not a shortcut.",
      difficulty: "senior",
    },
    {
      id: "advanced-q4",
      question: "A team needs their model to answer questions about internal documentation that changes weekly. What does the adaptation decision framework suggest?",
      options: [
        "Fine-tune the model every week to keep it current",
        "Favor RAG, since the core need is fresh/private knowledge access without retraining — not a deeply ingrained behavior change",
        "Use LoRA adapters trained from scratch each week",
        "Distill a smaller model weekly instead",
      ],
      correctIndex: 1,
      explanation: "RAG is specifically suited to knowledge that changes frequently or is private, because it injects current information per-request without any retraining. Fine-tuning/LoRA are better matched to ingraining a stable behavior, style, or format — re-fine-tuning weekly to chase changing facts is a mismatch between the technique and the actual constraint.",
      difficulty: "intermediate",
    },
    {
      id: "advanced-q5",
      question: "Why might increasing a reasoning model's thinking budget past a certain point fail to improve (or even hurt) accuracy on a given task?",
      options: [
        "Thinking budget has no effect on accuracy under any circumstances",
        "Returns on extra deliberation are task-dependent and can diminish or turn negative past a point — more budget always costs latency/money but doesn't guarantee proportionally better reasoning",
        "Thinking budget only affects output formatting, never reasoning quality",
        "This can only happen if temperature is also set to 0",
      ],
      correctIndex: 1,
      explanation: "Extended deliberation helps multi-step tasks up to a point, but past that point it can plateau or even introduce new failure modes (e.g. overanalyzing a simple problem into a wrong answer), while cost and latency keep climbing regardless. Budgets need empirical, per-task tuning rather than a 'more is always better' default.",
      difficulty: "senior",
    },
  ],
  presets: [
    {
      id: "advanced-quantization-precision-tour",
      label: "fp16 vs int8 vs int4 illustrative comparison",
      description: "Compare the illustrative size, latency factor, and quality notes across all three precision levels for the same model on the quantization demo.",
    },
    {
      id: "advanced-thinking-budget-sweep",
      label: "Sweep thinking budget across 4 presets on one hard problem",
      description: "Run the same multi-step reasoning problem through each reasoning preset's thinking budget and compare accuracy, latency, and cost.",
    },
    {
      id: "advanced-synthetic-data-from-seeds",
      label: "Generate 10 synthetic examples from 2 seed examples",
      description: "Watch the synthetic-data stream produce examples one at a time from a small seed set, and inspect diversity and quality across the generated batch.",
    },
    {
      id: "advanced-multimodal-vision-demo",
      label: "Ask a vision-capable model about an image",
      description: "Send an image plus a text question to a vision-capable model and compare the result against attempting the same request on a model that doesn't support vision.",
    },
  ],
};
