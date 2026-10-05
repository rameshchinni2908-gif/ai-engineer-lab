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
/**
 * jsdom implements neither `ResizeObserver` nor `IntersectionObserver`, but several
 * Radix primitives we build on (scroll-area, popover/tooltip positioning, select)
 * construct one on mount. Without these stubs any test that renders a module
 * Playground tab dies with `ResizeObserver is not defined` before it can assert
 * anything. Stubbed centrally (shared Vitest setup) rather than per module, since
 * every module page composes those primitives via <ModuleShell>.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof globalThis.ResizeObserver;
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof globalThis.IntersectionObserver;
}

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
