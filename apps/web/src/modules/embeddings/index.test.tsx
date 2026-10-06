import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
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

describe("embeddings module page (smoke)", () => {
  it("renders the real page via the router, not the 'coming in a later wave' placeholder", async () => {
    renderModule("/m/embeddings");
    expect(
      await screen.findByRole("heading", { name: /Embeddings & Vector DB/i }, { timeout: 20000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/coming in a later wave/i)).not.toBeInTheDocument();
    cleanup();
  });

  it("clicking the 'chunk size 200 vs 1000' preset actually sets the chunking lab's chunk-size control to 1000 (not just activePresetId)", async () => {
    renderModule("/m/embeddings/playground");

    const presetHeading = await screen.findByRole(
      "heading",
      { name: /Chunk size 200 vs 1000 on the same document/i, level: 3 },
      { timeout: 20000 },
    );
    const presetCard = presetHeading.parentElement!.parentElement as HTMLElement;
    const tryThisButton = within(presetCard).getByRole("button", { name: /try this/i });

    const chunkSizeInput = (await screen.findByLabelText(
      /Chunk size \(approx\. tokens\)/i,
      {},
      { timeout: 20000 },
    )) as HTMLInputElement;
    expect(chunkSizeInput.value).not.toBe("1000");

    fireEvent.click(tryThisButton);

    expect(chunkSizeInput.value).toBe("1000");
    cleanup();
  });
});
