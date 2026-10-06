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

describe("production module page (smoke)", () => {
  it("renders the real page via the router, not the 'coming in a later wave' placeholder", async () => {
    renderModule("/m/production");
    expect(
      await screen.findByRole("heading", { name: /Production \/ Cost \/ Observability/i }, { timeout: 20000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/coming in a later wave/i)).not.toBeInTheDocument();
    cleanup();
  });

  it("renders the cost/reliability/latency lab tabs in the Playground tab", async () => {
    renderModule("/m/production/playground");
    expect(await screen.findByRole("tab", { name: /Cost lab/i }, { timeout: 20000 })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /Reliability lab/i }, { timeout: 20000 })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /Latency lab/i }, { timeout: 20000 })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /Caching/i }, { timeout: 20000 })).toBeInTheDocument();
  });

  it("renders the tracing dashboard and rollout playbook in the Experiments tab", async () => {
    renderModule("/m/production/experiments");
    expect(
      await screen.findByRole("heading", { name: /Cost \/ tokens \/ latency, aggregated from real runs/i }, { timeout: 20000 }),
    ).toBeInTheDocument();
    cleanup();
  });
});
