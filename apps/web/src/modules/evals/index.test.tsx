import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/hooks/useTheme";
import { DifficultyProvider } from "@/hooks/useDifficulty";
import { TooltipProvider } from "@/components/ui";
import { ModuleRoute } from "@/app/router";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

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

describe("evals module page (smoke)", () => {
  it("renders the real page via the router, not the 'coming in a later wave' placeholder", async () => {
    renderModule("/m/evals");
    expect(await screen.findByRole("heading", { name: /^Evals$/i }, { timeout: 20000 })).toBeInTheDocument();
    expect(screen.queryByText(/coming in a later wave/i)).not.toBeInTheDocument();
    cleanup();
  });

  it("renders the dataset manager and eval runner in the Playground tab", async () => {
    renderModule("/m/evals/playground");
    expect(await screen.findByRole("heading", { name: /Dataset manager/i }, { timeout: 20000 })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /Run an eval across prompt versions/i }, { timeout: 20000 }),
    ).toBeInTheDocument();
    cleanup();
  });

  it("renders the judge-bias lab (with its simulation disclosure) and CI gate panel in the Experiments tab", async () => {
    renderModule("/m/evals/experiments");
    expect(
      await screen.findByRole("heading", { name: /Position bias/i }, { timeout: 20000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/deterministic offline simulations/i)).toBeInTheDocument();
    cleanup();
  });
});
