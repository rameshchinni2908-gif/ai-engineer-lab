import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModuleShell } from "./ModuleShell";
import { DifficultyProvider } from "@/hooks/useDifficulty";

/**
 * Regression coverage for the wave-3 "Run Inspector overlaps the Playground
 * column at 1280x720" bug. jsdom has no layout engine, so these tests cannot
 * measure real pixel geometry (that was verified with Playwright against a
 * running dev server - see the bug report). What they DO assert is the
 * structural contract that made the overlap possible, so a regression that
 * removes either guarantee fails loudly in CI:
 *
 *  1. The 3-column row is unambiguously `display: grid` when wide - it must
 *     not also carry a `flex` class (the two were previously mixed on the
 *     same element and only "worked" because of Tailwind's internal utility
 *     generation order, which is not a contract anyone should rely on).
 *  2. The center (Playground/Experiments/Pitfalls) column clips horizontal
 *     overflow (`overflow-x-hidden`) in addition to disabling its own
 *     content-based auto min-width (`min-w-0`). `min-w-0` alone only stops
 *     *this* element from forcing the grid track wider; it does nothing to
 *     stop a misbehaving descendant (e.g. a control with un-truncated text)
 *     from visually painting - and intercepting clicks - past the track
 *     boundary and into the Run Inspector aside. This is exactly what
 *     happened: a "Try this" / defense-toggle button's label forced it wider
 *     than the center track, and because nothing clipped it, the button's
 *     own hit-testable area (and Playwright's computed click point) ended up
 *     inside the Run Inspector aside, which - being the later sibling -
 *     intercepted the click. Removing `overflow-x-hidden` reproduces that.
 *
 * What this test does NOT prove: that no overlap is *visually* possible at
 * every viewport (that's Playwright/E2E territory). It proves the two class
 * contracts the fix depends on are present and won't silently regress.
 */

function mockWideViewport(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("1024") ? matches : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function renderShell() {
  const client = new QueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DifficultyProvider>
          <ModuleShell
            moduleId="security"
            title="Guardrails & Security"
            learn={<p>Learn content</p>}
            playground={<button type="button">Enable all (fully defended)</button>}
          />
        </DifficultyProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ModuleShell responsive layout contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the 3-column row as grid-only (not grid+flex) at wide widths", () => {
    mockWideViewport(true);
    renderShell();

    const row = screen.getByTestId("module-shell-row");
    expect(row.className).toContain("grid");
    expect(row.className).toContain("grid-cols-[minmax(0,320px)_1fr_minmax(0,360px)]");
    // Regression guard: this element must not also carry `flex`. Previously it
    // did, and only rendered as a grid because of Tailwind's utility-generation
    // order placing `.grid` after `.flex` in the stylesheet - an implementation
    // detail, not a contract. A bare `flex` class here is a sign that decision
    // has gone back to being accidental.
    expect(row.className.split(/\s+/)).not.toContain("flex");
  });

  it("clips horizontal overflow on the center (Playground) column so a too-wide descendant cannot paint over the Run Inspector aside", () => {
    mockWideViewport(true);
    renderShell();

    const center = screen.getByTestId("module-shell-center");
    const classes = center.className.split(/\s+/);
    expect(classes).toContain("min-w-0");
    // This is the actual fix: without it, a descendant wider than the track
    // (e.g. a button with an un-truncated long label) overflows visibly into
    // the Run Inspector aside's track and - because that aside is the later
    // DOM sibling - steals its pointer events.
    expect(classes).toContain("overflow-x-hidden");

    // Sanity: the Run Inspector aside is present and still exposes its
    // required accessible name regardless of this fix.
    expect(screen.getByRole("complementary", { name: "Run Inspector and explanation" })).toBeInTheDocument();
  });

  it("stacks into a single column (no grid, no side-by-side asides) below the wide breakpoint, and the Learn pane still folds into the Learn tab", () => {
    mockWideViewport(false);
    renderShell();

    const row = screen.getByTestId("module-shell-row");
    expect(row.className).not.toContain("grid-cols-[minmax(0,320px)_1fr_minmax(0,360px)]");
    expect(row.className.split(/\s+/)).toContain("flex-col");

    // Narrow screens: no persistent Learn aside column (it folds into the Learn tab instead).
    expect(screen.queryByRole("complementary", { name: "Learn" })).not.toBeInTheDocument();
    // Narrow screens: no persistent Run Inspector aside - it becomes the drawer, opened via this button.
    expect(screen.getByRole("button", { name: "Open Run Inspector" })).toBeInTheDocument();
  });

  it("keeps the Learn pane collapse toggle keyboard-accessible at wide widths", () => {
    mockWideViewport(true);
    renderShell();

    const learnAside = screen.getByRole("complementary", { name: "Learn" });
    const collapseBtn = within(learnAside).getByRole("button", { name: "Collapse Learn pane" });
    expect(collapseBtn).toHaveAttribute("aria-expanded", "true");
  });
});
