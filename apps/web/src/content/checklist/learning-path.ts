import type { LearningPathStep } from "../types";

/**
 * A guided, ordered learning path covering all 11 modules. `order` gives the
 * recommended linear sequence; `prerequisites` form a DAG that is consistent
 * with (never points forward past) that ordering — every id referenced here
 * resolves to another step in this same array.
 */
export const LEARNING_PATH: LearningPathStep[] = [
  {
    id: "lp-fundamentals",
    moduleId: "fundamentals",
    order: 1,
    title: "LLM Fundamentals",
    goal: "Understand tokens, context windows, and how sampling parameters actually shape generation, so every later module's cost/latency/determinism discussion makes sense.",
    estimatedMinutes: 45,
    prerequisites: [],
    checkpoints: [
      "You can explain why token count, not word count, determines cost and context usage",
      "You can predict how raising temperature changes the logprobs distribution for a given prompt",
      "You can explain why TTFT and tokens/sec are different metrics with different bottlenecks",
    ],
  },
  {
    id: "lp-prompting-core",
    moduleId: "prompting",
    order: 2,
    title: "Prompt Engineering: Core Techniques",
    goal: "Learn zero/few-shot, chain-of-thought, and role prompting, and when each trades tokens/latency for reliability.",
    estimatedMinutes: 40,
    prerequisites: ["lp-fundamentals"],
    checkpoints: [
      "You can choose between zero-shot and few-shot for a given task and justify the choice",
      "You can explain why chain-of-thought output isn't a guaranteed-accurate explanation of the model's real reasoning",
    ],
  },
  {
    id: "lp-prompting-advanced",
    moduleId: "prompting",
    order: 3,
    title: "Prompt Engineering: Templating, Versioning, and Injection Safety",
    goal: "Learn injection-safe templating, the instruction hierarchy's real limits, and why prompts need the same versioning discipline as code.",
    estimatedMinutes: 35,
    prerequisites: ["lp-prompting-core"],
    checkpoints: [
      "You can identify an unsafe template that concatenates untrusted input next to instructions",
      "You can explain why the system prompt is a steering mechanism, not a security boundary",
    ],
  },
  {
    id: "lp-structured",
    moduleId: "structured",
    order: 4,
    title: "Structured Output & Tool Calling",
    goal: "Understand the difference between syntactic (JSON mode) and semantic (schema) guarantees, and why tool-call arguments need validation before execution.",
    estimatedMinutes: 30,
    prerequisites: ["lp-prompting-advanced"],
    checkpoints: [
      "You can explain why a schema-valid tool call can still carry a hallucinated argument value",
      "You can design a bounded schema-repair loop with a defined fallback",
    ],
  },
  {
    id: "lp-embeddings",
    moduleId: "embeddings",
    order: 5,
    title: "Embeddings & Vector Databases",
    goal: "Understand similarity metrics, ANN index trade-offs, and why embedding model changes require a full re-index.",
    estimatedMinutes: 35,
    prerequisites: ["lp-fundamentals"],
    checkpoints: [
      "You can explain why mixing vectors from two embedding model versions silently corrupts search",
      "You can describe the recall/latency/memory trade-off between Flat, HNSW, and IVF indexes",
    ],
  },
  {
    id: "lp-rag-core",
    moduleId: "rag",
    order: 6,
    title: "RAG: Pipeline and Core Strategies",
    goal: "Build a basic RAG pipeline and understand where chunking, retrieval, and generation each introduce their own failure modes.",
    estimatedMinutes: 45,
    prerequisites: ["lp-embeddings", "lp-structured"],
    checkpoints: [
      "You can diagnose whether a bad RAG answer is a retrieval-stage or generation-stage failure",
      "You can explain when HyDE or multi-query retrieval would actually help versus add cost for nothing",
    ],
  },
  {
    id: "lp-rag-advanced",
    moduleId: "rag",
    order: 7,
    title: "RAG: Citations, Freshness, and Failure Modes",
    goal: "Learn to verify citations against real chunk content and recognize the stale-index and lost-in-the-middle failure modes.",
    estimatedMinutes: 40,
    prerequisites: ["lp-rag-core"],
    checkpoints: [
      "You can explain why a faithful answer can still be factually wrong",
      "You can describe how an index goes stale after a source document update and how to prevent it",
    ],
  },
  {
    id: "lp-agents-core",
    moduleId: "agents",
    order: 8,
    title: "Agents (+MCP): Loops, Tools, and Guardrails",
    goal: "Understand the agent loop, why all five tunable limits (steps/budget/timeout/loop-detection/approval) matter, and how MCP exposes tools across frameworks.",
    estimatedMinutes: 50,
    prerequisites: ["lp-structured", "lp-rag-core"],
    checkpoints: [
      "You can explain why the tool registry, not the system prompt, is the real security boundary for an agent",
      "You can design loop-detection and human-in-the-loop approval for a dangerous tool",
    ],
  },
  {
    id: "lp-evals",
    moduleId: "evals",
    order: 9,
    title: "Evals: Golden Datasets, LLM-as-Judge, and Regression Gating",
    goal: "Learn to build a measurable eval pipeline, mitigate judge biases, and wire regression gating into CI.",
    estimatedMinutes: 45,
    prerequisites: ["lp-prompting-advanced"],
    checkpoints: [
      "You can name three LLM-judge biases and their mitigations",
      "You can explain why a golden dataset needs periodic refresh from real production failures",
    ],
  },
  {
    id: "lp-security",
    moduleId: "security",
    order: 10,
    title: "Guardrails & Security: Injection, Jailbreaks, and Defense in Depth",
    goal: "Understand direct vs. indirect injection, why no single guardrail layer is sufficient, and how to red-team a feature safely.",
    estimatedMinutes: 50,
    prerequisites: ["lp-agents-core", "lp-rag-advanced"],
    checkpoints: [
      "You can distinguish direct from indirect prompt injection with a concrete example of each",
      "You can explain why defense in depth means asking 'what's the next layer that still catches this' for every control",
    ],
  },
  {
    id: "lp-production",
    moduleId: "production",
    order: 11,
    title: "Production, Cost, and Observability",
    goal: "Learn the four cost levers (cache/routing/batching/trimming), the six reliability levers, and why observability means every run is individually explainable.",
    estimatedMinutes: 45,
    prerequisites: ["lp-evals", "lp-security"],
    checkpoints: [
      "You can explain why retries need idempotency keys to be safe on non-idempotent writes",
      "You can distinguish what a circuit breaker protects against versus what retry-with-backoff protects against",
    ],
  },
  {
    id: "lp-advanced",
    moduleId: "advanced",
    order: 12,
    title: "Advanced Concepts: Adaptation, Quantization, and Reasoning Models",
    goal: "Understand the pretrain→SFT→RLHF/DPO pipeline, quantization trade-offs, and when RAG beats fine-tuning (and vice versa).",
    estimatedMinutes: 35,
    prerequisites: ["lp-production"],
    checkpoints: [
      "You can apply the RAG-vs-fine-tune-vs-LoRA-vs-distill decision framework to a concrete scenario",
      "You can explain why a quantization quality-retention figure from one model/task doesn't transfer to another",
    ],
  },
  {
    id: "lp-checklist",
    moduleId: "checklist",
    order: 13,
    title: "Senior Checklist: Design Review and System-Design Practice",
    goal: "Apply everything learned so far to a realistic design-review checklist and system-design scenarios with reference architectures.",
    estimatedMinutes: 30,
    prerequisites: ["lp-advanced", "lp-security", "lp-production"],
    checkpoints: [
      "You can walk through the full pre-ship checklist and explain the failure mode behind each item, not just check it off",
      "You can design a reference architecture for at least one of the system-design scenarios and defend its key decisions against the rubric",
    ],
  },
];
