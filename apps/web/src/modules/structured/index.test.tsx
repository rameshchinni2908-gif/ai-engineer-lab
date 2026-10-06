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

describe("structured module page (smoke)", () => {
  it("renders the real page via the router, not the 'coming in a later wave' placeholder", async () => {
    renderModule("/m/structured");
    expect(await screen.findByRole("heading", { name: /Structured Output/i }, { timeout: 20000 })).toBeInTheDocument();
    expect(screen.queryByText(/coming in a later wave/i)).not.toBeInTheDocument();
    // Explicit cleanup (not just relying on RTL's async afterEach) so no
    // leftover async work from this render can race the next test's mount.
    cleanup();
  });

  it("renders the mode-comparison and schema-editor headings in the Playground tab", async () => {
    renderModule("/m/structured/playground");
    expect(await screen.findByText(/Three modes compared/i, {}, { timeout: 20000 })).toBeInTheDocument();
    expect(await screen.findByText(/Schema editor/i, {}, { timeout: 20000 })).toBeInTheDocument();
    cleanup();
  });

  it("clicking the json-mode-vs-schema preset changes the mode-comparison prompt textarea's value, not just activePresetId", async () => {
    renderModule("/m/structured/playground");
    await screen.findByText(/Three modes compared/i, {}, { timeout: 20000 });

    const promptTextareaBefore = (await screen.findByLabelText(
      /Prompt \(same schema for all three modes\)/i,
      {},
      { timeout: 20000 },
    )) as HTMLTextAreaElement;
    expect(promptTextareaBefore.value).not.toContain("RAG vs fine-tuning");

    const presetHeading = await screen.findByText(
      /JSON mode vs full schema-constrained generation/i,
      {},
      { timeout: 20000 },
    );
    const presetCard = presetHeading.closest(".rounded-lg") as HTMLElement;
    fireEvent.click(within(presetCard).getByRole("button", { name: /try this/i }));

    // The ModeComparison prompt textarea must now contain the preset's prompt
    // text, proving the preset's params were actually applied to the control -
    // not merely that the preset card became active.
    const promptTextareaAfter = (await screen.findByLabelText(
      /Prompt \(same schema for all three modes\)/i,
      {},
      { timeout: 20000 },
    )) as HTMLTextAreaElement;
    expect(promptTextareaAfter.value).toContain("RAG vs fine-tuning");
  });
});
