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

describe("agents module page (smoke)", () => {
  it("renders the real page via the router, not the 'coming in a later wave' placeholder", async () => {
    renderModule("/m/agents");
    expect(
      await screen.findByRole("heading", { name: /Agents \(\+ MCP\)/i }, { timeout: 20000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/coming in a later wave/i)).not.toBeInTheDocument();
    cleanup();
  });

  it("renders the agent configuration form and live trace/memory inspector panels in the Playground tab", async () => {
    renderModule("/m/agents/playground");
    expect(
      await screen.findByRole("heading", { name: /Configure the agent/i }, { timeout: 20000 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Live trace/i }, { timeout: 20000 })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Memory inspector/i }, { timeout: 20000 })).toBeInTheDocument();
  });

  it("renders the runtime-comparison and MCP client sections in the Experiments tab", async () => {
    renderModule("/m/agents/experiments");
    expect(
      await screen.findByRole("heading", { name: /Compare two runtimes on the same goal/i }, { timeout: 20000 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /MCP client/i }, { timeout: 20000 })).toBeInTheDocument();
    cleanup();
  });
});
