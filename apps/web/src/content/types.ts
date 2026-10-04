import type { ModuleId, Difficulty } from "@ail/shared";

export interface GlossaryTerm {
  id: string;
  term: string;
  short: string;
  long: string;
  related: string[];
  moduleId?: ModuleId;
}

/** body = markdown-ish string (plain language, may use `code`, lists with "-", etc.) */
export interface LearnBlock {
  heading: string;
  body: string;
}

export interface ModuleLearnContent {
  moduleId: ModuleId;
  summary: Record<Difficulty, string>;
  explain: LearnBlock[];
  underTheHood: LearnBlock[];
  seniorGotchas: LearnBlock[];
}

export interface Pitfall {
  id: string;
  title: string;
  symptom: string;
  cause: string;
  fix: string;
  severity: "low" | "medium" | "high";
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: Difficulty;
}

export interface PresetCopy {
  id: string;
  label: string;
  description: string;
}

export interface ModuleContent {
  moduleId: ModuleId;
  learn: ModuleLearnContent;
  pitfalls: Pitfall[];
  quiz: QuizQuestion[];
  presets: PresetCopy[];
}

// ---------------------------------------------------------------------------
// Module 11 additions: design-review checklist, system-design scenarios, and
// the guided learning path. Additive only — see docs/contracts.md change log.
// ---------------------------------------------------------------------------

export interface ChecklistItem {
  id: string;
  category: string; // e.g. "Prompting", "Retrieval", "Agents", "Evals", "Security", "Cost", "Reliability", "Observability", "Data & Privacy", "Rollout"
  title: string;
  why: string; // why a senior engineer should care
  howToVerify: string; // a concrete check someone can actually perform
  severity: "critical" | "important" | "nice-to-have";
  moduleId?: ModuleId;
}

export interface ArchitectureNode {
  id: string;
  label: string;
  kind: "client" | "service" | "store" | "model" | "queue" | "cache" | "external";
  note?: string;
}

export interface ArchitectureEdge {
  from: string;
  to: string;
  label?: string;
}

export interface DesignDecision {
  decision: string;
  options: string[];
  recommendation: string;
  rationale: string;
}

export interface DesignScenario {
  id: string;
  title: string;
  brief: string; // the system-design prompt, as an interviewer would pose it
  requirements: string[];
  constraints: string[];
  referenceArchitecture: {
    summary: string;
    nodes: ArchitectureNode[];
    edges: ArchitectureEdge[]; // every from/to MUST match a node id in the same scenario
  };
  keyDecisions: DesignDecision[];
  tradeoffs: string[];
  rubric: { criterion: string; good: string; bad: string }[];
  relatedModules: ModuleId[];
}

export interface LearningPathStep {
  id: string;
  moduleId: ModuleId;
  order: number;
  title: string;
  goal: string;
  estimatedMinutes: number;
  prerequisites: string[]; // other LearningPathStep ids; MUST all resolve
  checkpoints: string[]; // "you can do X" statements the learner self-checks
}
