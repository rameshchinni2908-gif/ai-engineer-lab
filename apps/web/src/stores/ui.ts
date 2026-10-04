import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  /** Collapse state of the Learn (left) pane inside `<ModuleShell>`, persisted across modules. */
  learnPaneCollapsed: boolean;
  setLearnPaneCollapsed: (collapsed: boolean) => void;
  toggleLearnPane: () => void;

  /** Collapse/drawer state of the Run Inspector (right) pane inside `<ModuleShell>`. */
  inspectorCollapsed: boolean;
  setInspectorCollapsed: (collapsed: boolean) => void;
  toggleInspector: () => void;

  /** Left module nav collapsed to icons-only. */
  navCollapsed: boolean;
  toggleNav: () => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  shortcutsDialogOpen: boolean;
  setShortcutsDialogOpen: (open: boolean) => void;
}

/** Layout chrome state (pane collapse, dialogs). Persisted so returning users keep their layout. */
export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      learnPaneCollapsed: false,
      setLearnPaneCollapsed: (collapsed) => set({ learnPaneCollapsed: collapsed }),
      toggleLearnPane: () => set({ learnPaneCollapsed: !get().learnPaneCollapsed }),

      inspectorCollapsed: false,
      setInspectorCollapsed: (collapsed) => set({ inspectorCollapsed: collapsed }),
      toggleInspector: () => set({ inspectorCollapsed: !get().inspectorCollapsed }),

      navCollapsed: false,
      toggleNav: () => set({ navCollapsed: !get().navCollapsed }),

      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      shortcutsDialogOpen: false,
      setShortcutsDialogOpen: (open) => set({ shortcutsDialogOpen: open }),
    }),
    {
      name: "ail-ui",
      partialize: (state) => ({
        learnPaneCollapsed: state.learnPaneCollapsed,
        inspectorCollapsed: state.inspectorCollapsed,
        navCollapsed: state.navCollapsed,
      }),
    },
  ),
);
