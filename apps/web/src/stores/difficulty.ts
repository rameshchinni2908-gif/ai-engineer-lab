import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Difficulty } from "@ail/shared";

interface DifficultyState {
  difficulty: Difficulty;
  setDifficulty: (difficulty: Difficulty) => void;
}

/**
 * Global Beginner/Intermediate/Senior content-depth toggle (CLAUDE.md
 * "global features"). Persisted across sessions. Prefer the `useDifficulty()`
 * hook (hooks/useDifficulty.ts) over importing this store directly from
 * module code, so the access pattern stays consistent.
 */
export const useDifficultyStore = create<DifficultyState>()(
  persist(
    (set) => ({
      difficulty: "intermediate",
      setDifficulty: (difficulty) => set({ difficulty }),
    }),
    { name: "ail-difficulty" },
  ),
);
