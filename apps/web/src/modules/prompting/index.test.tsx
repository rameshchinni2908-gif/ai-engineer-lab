import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/hooks/useTheme";
import { DifficultyProvider } from "@/hooks/useDifficulty";
import { TooltipProvider } from "@/components/ui";
import { ModuleRoute } from "@/app/router";

// jsdom has no ResizeObserver; Radix Slider needs one at render time. Local to this test file only - not a shared setup.ts edit.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// A FRESH QueryClient per render (rather than the app's shared singleton from
// `@/app/providers`) so one test's react-query cache/retry state can never
// bleed into the next test in this file.
function renderModule(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <DifficultyProvider>
          <TooltipProvider>
            <MemoryRouter initialEntries={[path]}>
              <Routes>
                <Route path="/m/:moduleId" element={<ModuleRoute />} />
                <Route path="/m/:moduleId/:tab" element={<ModuleRoute />} />
              </Routes>
            </MemoryRouter>
          </TooltipProvider>
        </DifficultyProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("prompting module page (smoke)", () => {
  it("renders the real page via the router, not the 'coming in a later wave' placeholder", async () => {
    renderModule("/m/prompting");
    expect(await screen.findByRole("heading", { name: /Prompt Engineering/i }, { timeout: 20000 })).toBeInTheDocument();
    expect(screen.queryByText(/coming in a later wave/i)).not.toBeInTheDocument();
    // Explicit cleanup (not just relying on RTL's async afterEach) so no
    // leftover async work from this render can race the next test's mount.
    cleanup();
  });

  it("renders the prompt anatomy builder and technique demos headings in the Playground tab", async () => {
    renderModule("/m/prompting/playground");
    expect(
      await screen.findByText(/Prompt anatomy builder/i, {}, { timeout: 20000 }),
    ).toBeInTheDocument();
    // "Technique demos" appears both as a section heading and as a nav/label
    // elsewhere in the playground, so an exact-text query is ambiguous. Assert on
    // the heading specifically, which is what this smoke test actually cares about.
    expect(
      await screen.findByRole("heading", { name: /Technique demos/i }, { timeout: 20000 }),
    ).toBeInTheDocument();
    cleanup();
  });

  it("clicking the self-consistency preset changes the technique select's value, not just activePresetId", async () => {
    renderModule("/m/prompting/playground");
    await screen.findByRole("heading", { name: /Technique demos/i }, { timeout: 20000 });

    // Before applying the preset, the default technique is "cot" (Chain-of-thought).
    expect(screen.queryByText(/Self-consistency \(5 votes\)/i)).not.toBeInTheDocument();

    const presetHeading = await screen.findByText(
      /Self-consistency: 5 reasoning paths, majority vote/i,
      {},
      { timeout: 20000 },
    );
    const presetCard = presetHeading.closest(".rounded-lg") as HTMLElement;
    fireEvent.click(within(presetCard).getByRole("button", { name: /try this/i }));

    // The technique <Select>'s displayed value must now reflect the preset's
    // technique ("self-consistency"), proving the preset's params were actually
    // applied to the control - not merely that the preset card became active.
    expect(
      await screen.findByText(/Self-consistency \(5 votes\)/i, {}, { timeout: 20000 }),
    ).toBeInTheDocument();
  });
});
