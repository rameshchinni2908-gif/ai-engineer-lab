import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeState {
  /** User's stored preference; "system" follows `prefers-color-scheme`. */
  preference: ThemePreference;
  /** The actually-applied theme (resolved from preference + OS setting). */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
  /** Re-derive `resolved` from the current preference + OS media query. Call on mount and on OS change. */
  syncResolved: () => void;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyToDocument(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

/**
 * Theme store: `class` strategy (toggles `.dark` on `<html>`), persisted
 * preference, respects `prefers-color-scheme` when preference is "system".
 * `main.tsx` applies the resolved theme before first paint to avoid a flash
 * (see the inline script in `index.html`).
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      preference: "system",
      resolved: getSystemTheme(),
      setPreference: (preference) => {
        const resolved = preference === "system" ? getSystemTheme() : preference;
        applyToDocument(resolved);
        set({ preference, resolved });
      },
      toggle: () => {
        const next: ResolvedTheme = get().resolved === "dark" ? "light" : "dark";
        applyToDocument(next);
        set({ preference: next, resolved: next });
      },
      syncResolved: () => {
        const { preference } = get();
        const resolved = preference === "system" ? getSystemTheme() : preference;
        applyToDocument(resolved);
        set({ resolved });
      },
    }),
    {
      name: "ail-theme",
      partialize: (state) => ({ preference: state.preference }),
    },
  ),
);
