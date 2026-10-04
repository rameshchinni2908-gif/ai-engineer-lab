import * as React from "react";
import { useThemeStore, type ResolvedTheme, type ThemePreference } from "@/stores/theme";

export interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/**
 * Applies the resolved theme to `<html class="dark">` and keeps it in sync
 * with OS `prefers-color-scheme` changes while `preference === "system"`.
 * The actual first-paint (no-flash) application happens via the inline
 * script in `index.html` - this provider takes over for the React lifetime.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const preference = useThemeStore((s) => s.preference);
  const resolved = useThemeStore((s) => s.resolved);
  const setPreference = useThemeStore((s) => s.setPreference);
  const toggle = useThemeStore((s) => s.toggle);
  const syncResolved = useThemeStore((s) => s.syncResolved);

  React.useEffect(() => {
    syncResolved();
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => syncResolved();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncResolved is stable (zustand action)
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference, toggle }),
    [preference, resolved, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Read/write dark-light-system theme preference. Must be used under `<ThemeProvider>`. */
export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used within <ThemeProvider>");
  return ctx;
}
