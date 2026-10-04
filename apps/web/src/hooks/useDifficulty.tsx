import * as React from "react";
import type { Difficulty } from "@ail/shared";
import { useDifficultyStore } from "@/stores/difficulty";

const ORDER: Difficulty[] = ["beginner", "intermediate", "senior"];

export interface DifficultyContextValue {
  difficulty: Difficulty;
  setDifficulty: (difficulty: Difficulty) => void;
  /** True if the current difficulty is >= `level` in the beginner < intermediate < senior order. */
  isAtLeast: (level: Difficulty) => boolean;
  /** Pick the value for the current difficulty out of a `Record<Difficulty, T>` map. */
  pick: <T>(map: Record<Difficulty, T>) => T;
}

const DifficultyContext = React.createContext<DifficultyContextValue | null>(null);

/**
 * Wraps the persisted Zustand difficulty store in a React context (per
 * CLAUDE.md's "difficulty toggle (context)" + docs/contracts.md §6's
 * `DifficultyContext`/`useDifficulty()`). Mount once near the app root
 * (`app/providers.tsx`). All content/explanations should react to this.
 */
export function DifficultyProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const difficulty = useDifficultyStore((s) => s.difficulty);
  const setDifficulty = useDifficultyStore((s) => s.setDifficulty);

  const value = React.useMemo<DifficultyContextValue>(
    () => ({
      difficulty,
      setDifficulty,
      isAtLeast: (level) => ORDER.indexOf(difficulty) >= ORDER.indexOf(level),
      pick: (map) => map[difficulty],
    }),
    [difficulty, setDifficulty],
  );

  return <DifficultyContext.Provider value={value}>{children}</DifficultyContext.Provider>;
}

/** Read/write the global Beginner/Intermediate/Senior toggle. Must be used under `<DifficultyProvider>`. */
export function useDifficulty(): DifficultyContextValue {
  const ctx = React.useContext(DifficultyContext);
  if (!ctx) throw new Error("useDifficulty() must be used within <DifficultyProvider>");
  return ctx;
}
