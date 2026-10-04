import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RunsState {
  /** Most-recent-first list of run ids the user has produced this session (persisted, capped). */
  recentRunIds: string[];
  pushRecentRun: (runId: string) => void;
  clearRecentRuns: () => void;

  /** The two runs currently staged for `<CompareView>` (set from Run Inspector "Compare" actions). */
  compareA?: string;
  compareB?: string;
  setCompareSlot: (slot: "a" | "b", runId: string | undefined) => void;
  clearCompare: () => void;
}

const MAX_RECENT = 50;

/** Tracks recent run ids + the A/B compare selection, shared across all modules. */
export const useRunsStore = create<RunsState>()(
  persist(
    (set, get) => ({
      recentRunIds: [],
      pushRecentRun: (runId) => {
        const existing = get().recentRunIds.filter((id) => id !== runId);
        set({ recentRunIds: [runId, ...existing].slice(0, MAX_RECENT) });
      },
      clearRecentRuns: () => set({ recentRunIds: [] }),

      compareA: undefined,
      compareB: undefined,
      setCompareSlot: (slot, runId) =>
        set(slot === "a" ? { compareA: runId } : { compareB: runId }),
      clearCompare: () => set({ compareA: undefined, compareB: undefined }),
    }),
    { name: "ail-runs" },
  ),
);
