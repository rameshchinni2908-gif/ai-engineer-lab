import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ModuleId } from "@ail/shared";

export type ModuleTab = "learn" | "playground" | "experiments" | "pitfalls";

interface ProgressState {
  /** Set of `"<moduleId>:<tab>"` keys the user has visited, driving the left-nav progress indicators. */
  visited: Record<string, boolean>;
  markVisited: (moduleId: ModuleId, tab: ModuleTab) => void;
  isModuleStarted: (moduleId: ModuleId) => boolean;
  isModuleComplete: (moduleId: ModuleId) => boolean;
  /** 0..1 fraction of the 4 tabs visited for a module - used for the nav progress ring/bar. */
  moduleCompletionRatio: (moduleId: ModuleId) => number;
}

const ALL_TABS: ModuleTab[] = ["learn", "playground", "experiments", "pitfalls"];

function key(moduleId: ModuleId, tab: ModuleTab): string {
  return `${moduleId}:${tab}`;
}

/** Tracks which (module, tab) pairs the user has opened, for nav progress indicators. */
export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      visited: {},
      markVisited: (moduleId, tab) =>
        set((state) => ({ visited: { ...state.visited, [key(moduleId, tab)]: true } })),
      isModuleStarted: (moduleId) =>
        ALL_TABS.some((tab) => get().visited[key(moduleId, tab)] === true),
      isModuleComplete: (moduleId) =>
        ALL_TABS.every((tab) => get().visited[key(moduleId, tab)] === true),
      moduleCompletionRatio: (moduleId) => {
        const visitedCount = ALL_TABS.filter((tab) => get().visited[key(moduleId, tab)]).length;
        return visitedCount / ALL_TABS.length;
      },
    }),
    { name: "ail-progress" },
  ),
);
