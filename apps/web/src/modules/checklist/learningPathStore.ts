import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LearningPathProgressState {
  completedStepIds: Record<string, boolean>;
  toggleStep: (stepId: string, completed: boolean) => void;
  isStepComplete: (stepId: string) => boolean;
}

/**
 * M11 learning-path step completion, persisted client-side (CLAUDE.md's
 * "progress persisted" pattern applied specifically to `LEARNING_PATH`
 * steps - the shared `stores/progress.ts` only tracks per-tab visits, not
 * per-step completion, and is owned by frontend-shell, so this module owns
 * its own small persisted store under its own folder rather than editing
 * that one).
 */
export const useLearningPathStore = create<LearningPathProgressState>()(
  persist(
    (set, get) => ({
      completedStepIds: {},
      toggleStep: (stepId, completed) =>
        set((state) => ({ completedStepIds: { ...state.completedStepIds, [stepId]: completed } })),
      isStepComplete: (stepId) => get().completedStepIds[stepId] === true,
    }),
    { name: "ail-checklist-learning-path" },
  ),
);
