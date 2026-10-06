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

/**
 * jsdom implements no layout, so it ships no `Element.prototype.scrollIntoView`
 * at all - calling it throws "scrollIntoView is not a function" and, because the
 * call happens inside a React event handler, the error surfaces as an uncaught
 * exception that fails the whole test file rather than one assertion.
 *
 * M4's Embeddings page legitimately calls it: selecting a preset scrolls the
 * user to the lab section that preset targets. That is real, desirable product
 * behaviour, so the right fix is to teach the test environment about the method
 * rather than to remove a feature for the benefit of the test runner.
 *
 * A no-op is the honest stub here: it records nothing and asserts nothing, and
 * no test should ever claim to verify scrolling on the strength of it - jsdom
 * cannot scroll. It exists purely so that calling the method is not fatal.
 */
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}
