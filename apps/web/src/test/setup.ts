import "@testing-library/jest-dom/vitest";

/**
 * jsdom does not implement `window.matchMedia`. Most of our code guards for
 * its absence (`typeof window.matchMedia === "function"`), but a real
 * (minimal) implementation lets tests exercise the actual
 * dark/light + `prefers-reduced-motion` + responsive-layout code paths
 * instead of only their "unsupported" fallback branch. Added here (shared
 * Vitest setup) rather than per-test since every hook/component under
 * `src/{hooks,stores,components}` may call it.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    return {
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener),
      removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    } as MediaQueryList;
  };
}
