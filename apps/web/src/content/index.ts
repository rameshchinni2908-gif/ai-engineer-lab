import type { ModuleId } from "@ail/shared";
import type { ModuleContent } from "./types";
import { fundamentalsContent } from "./modules/fundamentals";
import { promptingContent } from "./modules/prompting";
import { structuredContent } from "./modules/structured";
import { embeddingsContent } from "./modules/embeddings";
import { ragContent } from "./modules/rag";
import { agentsContent } from "./modules/agents";
import { evalsContent } from "./modules/evals";
import { securityContent } from "./modules/security";
import { productionContent } from "./modules/production";
import { advancedContent } from "./modules/advanced";
import { checklistContent } from "./modules/checklist";

export const MODULE_CONTENT: Record<ModuleId, ModuleContent> = {
  fundamentals: fundamentalsContent,
  prompting: promptingContent,
  structured: structuredContent,
  embeddings: embeddingsContent,
  rag: ragContent,
  agents: agentsContent,
  evals: evalsContent,
  security: securityContent,
  production: productionContent,
  advanced: advancedContent,
  checklist: checklistContent,
};

export { GLOSSARY } from "./glossary";
export { CHECKLIST_ITEMS, DESIGN_SCENARIOS, LEARNING_PATH } from "./checklist";
export * from "./types";
