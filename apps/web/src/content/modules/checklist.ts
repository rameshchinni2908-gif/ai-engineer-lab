import type { ModuleContent } from "../types";

export const checklistContent: ModuleContent = {
  moduleId: "checklist",
  learn: {
    moduleId: "checklist",
    summary: {
      beginner:
        "This module ties everything together: a glossary of terms used across the app, and a checklist of things a senior AI engineer should be able to explain or verify before shipping an LLM feature.",
      intermediate:
        "The checklist is organized by the same categories as the rest of the app — fundamentals, prompting, structured output, retrieval, agents, evals, security, production — so a gap in the checklist points directly at which module to revisit.",
      senior:
        "Treat this checklist as a design-review gate, not a trivia quiz: each item maps to a real failure mode covered elsewhere in this app (a pitfall, a senior gotcha, a glossary entry), and the goal is being able to answer 'what would break and why' for each one, not just recognizing the term.",
    },
    explain: [
      {
        heading: "The glossary is static, build-time content — not a live API",
        body: "Per this app's architecture, the glossary lives in frontend content and is looked up directly by the `<GlossaryTerm>` component — there's no `GET /glossary` route. This module is where the full glossary is browsable end to end, while individual terms surface as inline tooltips throughout every other module.",
      },
      {
        heading: "Progress tracking is deliberately simple: one user, one row",
        body: "`/checklist/progress` persists a single progress row (no auth in v1) rather than per-user state — this app's checklist is meant to track one engineer's (or one team's) own learning progress through the material, not to be a multi-tenant certification product.",
      },
      {
        heading: "Quiz scoring explains, it doesn't just grade",
        body: "`/checklist/quiz/:quizId/submit` returns `explanations` alongside the pass/fail `correct` map for every question — the goal of every quiz across this app is to teach something in the explanation, even (especially) when the answer was wrong.",
      },
    ],
    underTheHood: [
      {
        heading: "Checklist item content lives here; only completion state is server-persisted",
        body: "The actual checklist items (id, category, question) are authored content in this module, while the API only stores which item ids are marked complete — this mirrors the general content/data split used throughout the app: narrative content is static TS, dynamic state is the API's job.",
      },
      {
        heading: "System-design reference scenarios are decision frameworks, not computations",
        body: "The versioning/rollout playbook (pinning, shadow, canary, deprecation) and the adaptation decision matrix (prompting vs. RAG vs. fine-tune vs. LoRA vs. distill) are static educational content precisely because they're frameworks for a human decision, not something with a single computed right answer an API could return.",
      },
    ],
    seniorGotchas: [
      {
        heading: "A checklist item checked off is not the same as the underlying skill being verified",
        body: "Treat checked-off items as a personal tracking aid, not as proof of competence for a design review — the real test is whether you can walk through the specific failure mode (and its fix) the item is standing in for, using this app's own pitfalls and senior-gotchas content as the actual reference.",
      },
      {
        heading: "The glossary's 'related' links are a map of real dependencies, not just a word cloud",
        body: "When a glossary term's related terms span multiple modules (e.g. prompt-injection relates to both prompting and security content), that's signaling a genuine cross-cutting concern — understanding one without the other leaves a real gap, not just a vocabulary gap.",
      },
    ],
  },
  pitfalls: [
    {
      id: "checklist-completion-without-verification",
      title: "Checklist items are marked complete without the underlying skill being verified",
      symptom: "A team's checklist shows 100% completion, but a design review surfaces basic gaps in the exact areas marked done.",
      cause: "Checklist completion was treated as the goal itself rather than as a tracking aid for genuine understanding — items were checked off after reading, not after being able to explain the failure mode and fix.",
      fix: "Use the checklist as a self-assessment prompt, not a compliance checkbox — pair each completed item with being able to explain, unprompted, the pitfall and fix it maps to.",
      severity: "low",
    },
    {
      id: "checklist-glossary-tooltip-skimmed",
      title: "A glossary tooltip's short definition is treated as sufficient understanding",
      symptom: "A term is used correctly in casual conversation but its actual trade-off or failure mode is misunderstood in a real design decision.",
      cause: "The short tooltip definition (by design, under ~140 characters) was read in isolation without following through to the long definition's senior-level insight or the related module's content.",
      fix: "Treat the short definition as a reminder/lookup, and the long definition plus the linked module's Learn content as the actual source of the insight needed for real decisions.",
      severity: "low",
    },
    {
      id: "checklist-stale-decision-framework",
      title: "A static decision framework (RAG vs. fine-tune, etc.) is applied without checking it against the current situation",
      symptom: "A technique is chosen because 'the decision matrix says so' even though the specific constraints of the actual project don't match the framework's assumptions.",
      cause: "The adaptation decision matrix is a general framework for common cases, not a lookup table that covers every nuance of a specific project's actual constraints (data freshness needs, latency budget, team's fine-tuning capacity).",
      fix: "Use the framework as a starting hypothesis, then validate against the specific project's actual constraints before committing — the framework narrows the search space, it doesn't replace the decision.",
      severity: "low",
    },
    {
      id: "checklist-single-user-progress-confusion",
      title: "Progress tracking behaves unexpectedly when multiple people use the same deployed instance",
      symptom: "Two different engineers using the same running instance see each other's checklist/quiz progress merged together.",
      cause: "This app's checklist progress is deliberately single-user (one row, no auth in v1) — it was not designed as a multi-tenant tracking system.",
      fix: "Run separate local instances (or separate database files) per engineer/team if independent progress tracking is needed; don't expect per-user isolation from a single shared deployment.",
      severity: "low",
    },
  ],
  quiz: [
    {
      id: "checklist-q1",
      question: "Why does this app's glossary live in frontend content instead of being served by an API route?",
      options: [
        "Because API routes cannot return arrays of objects",
        "Because the glossary is static, build-time content per CLAUDE.md's content-location convention, and is looked up directly by the `<GlossaryTerm>` component without needing a network round-trip",
        "Because the glossary changes too frequently to be cached",
        "Because glossary terms require authentication to view",
      ],
      correctIndex: 1,
      explanation: "CLAUDE.md is explicit that Learn text, glossary, and quizzes are typed content owned by content-writer, not hardcoded in components or served dynamically — the glossary is static enough, and used widely enough (tooltips everywhere), that build-time content is the right fit.",
      difficulty: "beginner",
    },
    {
      id: "checklist-q2",
      question: "A checklist item is marked complete, but in a design review the engineer can't explain the underlying pitfall it represents. What does this indicate?",
      options: [
        "The checklist item was defective and should be removed",
        "Checklist completion was treated as the goal rather than a tracking aid — the real verification is being able to explain the failure mode, not the checkbox state",
        "The design review process is flawed and should be skipped",
        "This is expected and not actually a problem",
      ],
      correctIndex: 1,
      explanation: "The checklist exists to track progress through real understanding, not to be gamed as a completion metric. An item checked off without being able to explain its underlying failure mode and fix hasn't actually achieved what the checklist is tracking.",
      difficulty: "intermediate",
    },
    {
      id: "checklist-q3",
      question: "Why does `/checklist/quiz/:quizId/submit` return `explanations` for every question, not just a pass/fail score?",
      options: [
        "To make the response payload larger for no reason",
        "Because every quiz in this app is designed to teach, including on a wrong answer — the explanation is where the actual learning happens, not just the score",
        "Because explanations are required by the SSE protocol",
        "Only to satisfy a schema validation requirement with no pedagogical purpose",
      ],
      correctIndex: 1,
      explanation: "A bare score tells you whether you were right, not why. Explanations for every question (including correct ones) are what make a quiz a learning tool rather than just a test — this is consistent with how quizzes are designed across every module in this app.",
      difficulty: "beginner",
    },
    {
      id: "checklist-q4",
      question: "A glossary term's `related` array links it to terms in two different modules. What does that typically signal?",
      options: [
        "A data-entry mistake that should be fixed",
        "A genuine cross-cutting concern — understanding the term well requires following both modules' content, not just one",
        "That the term should be deleted since it doesn't belong to one module",
        "Nothing; related links are purely decorative",
      ],
      correctIndex: 1,
      explanation: "Cross-module related links (e.g. a security term relating to a prompting term) reflect real conceptual overlap — prompt injection, for instance, is both a prompting-template concern and a security concern. Following those links across modules is part of building the full picture.",
      difficulty: "intermediate",
    },
    {
      id: "checklist-q5",
      question: "Why is the RAG-vs-fine-tune-vs-LoRA-vs-distill decision matrix static content rather than an API-computed recommendation?",
      options: [
        "Because computing it would require real-time provider pricing data that doesn't exist",
        "Because it's a decision framework for a human engineer to apply against their specific constraints, not a function with one deterministic correct output",
        "Because the API has no way to represent decision trees",
        "Because this decision has already been made identically for every possible project",
      ],
      correctIndex: 1,
      explanation: "This is explicitly documented as a decision framework, not a computation — the right choice depends on project-specific constraints (data freshness, latency budget, team capacity) that no single API call could capture. It narrows the search space; the engineer still has to apply judgment.",
      difficulty: "senior",
    },
  ],
  presets: [
    {
      id: "checklist-full-glossary-browse",
      label: "Browse the full glossary by module",
      description: "Filter the glossary by each module's linked terms to review every concept a specific module depends on in one pass.",
    },
    {
      id: "checklist-design-review-walkthrough",
      label: "Walk the checklist as a mock design review",
      description: "Go through each checklist category and practice explaining, out loud, the failure mode and fix each item represents — not just checking it off.",
    },
    {
      id: "checklist-adaptation-decision-practice",
      label: "Apply the adaptation decision matrix to a real scenario",
      description: "Pick a concrete hypothetical project constraint (e.g. 'docs change weekly, must cite sources') and use the decision matrix to justify RAG over fine-tuning or vice versa.",
    },
    {
      id: "checklist-quiz-retake-weak-areas",
      label: "Retake quizzes only for modules scored below 80%",
      description: "Review quiz scores across all 11 modules, identify any below an 80% threshold, and retake just those quizzes after revisiting the module's senior gotchas.",
    },
  ],
};
