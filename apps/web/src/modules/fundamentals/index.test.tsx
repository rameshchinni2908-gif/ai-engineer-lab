import { render, screen, cleanup } from "@testing-library/react";
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

describe("fundamentals module page (smoke)", () => {
  it("renders the real page via the router, not the 'coming in a later wave' placeholder", async () => {
    renderModule("/m/fundamentals");
    expect(await screen.findByRole("heading", { name: /LLM Fundamentals/i }, { timeout: 20000 })).toBeInTheDocument();
    expect(screen.queryByText(/coming in a later wave/i)).not.toBeInTheDocument();
    // Explicit cleanup (not just relying on RTL's async afterEach) so no
    // leftover async work from this render can race the next test's mount.
    cleanup();
  });

  it("renders the tokenizer visualizer and sampling lab headings in the Playground tab", async () => {
    renderModule("/m/fundamentals/playground");
    expect(
      await screen.findByText((_, el) => el?.tagName === "H3" && /tokenizer/i.test(el.textContent ?? ""), {}, { timeout: 20000 }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Sampling lab/i, {}, { timeout: 20000 })).toBeInTheDocument();
  });
});
