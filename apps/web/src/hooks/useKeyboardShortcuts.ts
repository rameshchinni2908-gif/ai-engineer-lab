import { useEffect } from "react";
import { useThemeStore } from "@/stores/theme";
import { useUiStore } from "@/stores/ui";

/** Custom DOM event name dispatched when the user presses the global "run" shortcut. */
export const RUN_SHORTCUT_EVENT = "ail:run-shortcut";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable ||
    target.getAttribute("role") === "textbox"
  );
}

/**
 * App-wide keyboard shortcuts (CLAUDE.md: "keyboard shortcuts with a
 * discoverable help dialog"). Mount once, at the app root (`layouts/AppShell`):
 *
 * - `Ctrl/Cmd+Enter` - dispatch the "run" shortcut (playgrounds subscribe via `useRunShortcut`)
 * - `Ctrl/Cmd+Shift+L` - toggle light/dark theme
 * - `Ctrl/Cmd+I` - toggle the Run Inspector pane
 * - `Ctrl/Cmd+K` - open the command palette (module jump)
 * - `?` - open the keyboard shortcuts help dialog (ignored while typing in a field)
 */
export function useGlobalKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key === "Enter") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent(RUN_SHORTCUT_EVENT));
        return;
      }

      if (meta && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        useThemeStore.getState().toggle();
        return;
      }

      if (meta && !event.shiftKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        useUiStore.getState().toggleInspector();
        return;
      }

      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        useUiStore.getState().setCommandPaletteOpen(true);
        return;
      }

      if (!meta && event.key === "?" && !isEditableTarget(event.target)) {
        event.preventDefault();
        useUiStore.getState().setShortcutsDialogOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

/**
 * Module playgrounds opt into the global `Ctrl/Cmd+Enter` "run" shortcut by
 * calling this with their own run handler. Only one playground is mounted
 * at a time (one route), so there's no need to pick "the active" one.
 */
export function useRunShortcut(onRun: () => void): void {
  useEffect(() => {
    function handler(): void {
      onRun();
    }
    window.addEventListener(RUN_SHORTCUT_EVENT, handler);
    return () => window.removeEventListener(RUN_SHORTCUT_EVENT, handler);
  }, [onRun]);
}
