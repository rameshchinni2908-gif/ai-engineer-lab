import type { ModuleId } from "@ail/shared";

export interface ModuleNavEntry {
  id: ModuleId;
  order: number;
  title: string;
  shortDescription: string;
}

/**
 * Canonical list + ordering of the 11 learning modules, driven by the shared
 * ModuleId enum. frontend-shell (Wave 1) replaces the placeholder HomePage
 * that reads this list with the real <ModuleShell>-based nav; module-owning
 * agents (Wave 2) should not need to edit this file - ping the architect if
 * a module's title/description needs to change.
 */
export const MODULE_NAV: ModuleNavEntry[] = [
  { id: "fundamentals", order: 1, title: "LLM Fundamentals", shortDescription: "Tokens, context windows, sampling, streaming." },
  { id: "prompting", order: 2, title: "Prompt Engineering", shortDescription: "Techniques, versioning, injection-safe templating." },
  { id: "structured", order: 3, title: "Structured Output & Tools", shortDescription: "JSON mode, schemas, tool calling." },
  { id: "embeddings", order: 4, title: "Embeddings & Vector DB", shortDescription: "Chunking, indexing, hybrid search, reranking." },
  { id: "rag", order: 5, title: "RAG", shortDescription: "Retrieval-augmented generation end to end." },
  { id: "agents", order: 6, title: "Agents (+MCP)", shortDescription: "Runtimes, tools, memory, limits, traces." },
  { id: "evals", order: 7, title: "Evals", shortDescription: "Datasets, metrics, regressions, CI gating." },
  { id: "security", order: 8, title: "Guardrails & Security", shortDescription: "Attacks, defenses, OWASP LLM Top 10." },
  { id: "production", order: 9, title: "Production/Cost/Observability", shortDescription: "Tracing, cost, reliability, rollout." },
  { id: "advanced", order: 10, title: "Advanced Concepts", shortDescription: "Attention, RLHF/DPO, multimodal, quantization." },
  { id: "checklist", order: 11, title: "Glossary & Senior Checklist", shortDescription: "Guided path, quizzes, design-review checklist." },
];
