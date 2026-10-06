import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/hooks/useTheme";
import { DifficultyProvider } from "@/hooks/useDifficulty";
import { TooltipProvider } from "@/components/ui";
import { ModuleRoute } from "@/app/router";

/**
 * `UploadAndIngest` talks to the real backend via `ragApi` (`./api` ->
 * `apiFetch` -> `fetch`). jsdom has no server to answer that, so any test
 * that needs an actual `Document` mounted (to get past the `!doc` EmptyState
 * gate) must stub `ragApi` here rather than hit the network. Mocked at the
 * same relative path (`./api`, resolving to this directory's `api.ts`) that
 * `UploadAndIngest.tsx` imports, so both resolve to one module instance.
 */
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    ragApi: {
      ...actual.ragApi,
      listDocuments: vi.fn().mockResolvedValue({ items: [], total: 0, page: 0, pageSize: 20, hasMore: false }),
      createDocument: vi.fn().mockResolvedValue({
        id: "test-doc-chunk-size-preset",
        name: "preset-test.md",
        mimeType: "text/markdown",
        sizeBytes: 64,
        text: "# Preset test document\n\nSeeded in jsdom (no network) so the chunking controls mount.",
        metadata: {},
        createdAt: new Date().toISOString(),
      }),
    },
  };
});

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

describe("rag module page (smoke)", () => {
  it("renders the real page via the router, not the 'coming in a later wave' placeholder", async () => {
    renderModule("/m/rag");
    expect(await screen.findByRole("heading", { name: /^RAG$/i }, { timeout: 20000 })).toBeInTheDocument();
    expect(screen.queryByText(/coming in a later wave/i)).not.toBeInTheDocument();
    cleanup();
  });

  it("clicking the 'chunk size 200 vs 1000' preset actually sets the upload pipeline's chunk-size control to 1000 (not just activePresetId)", async () => {
    renderModule("/m/rag/playground");

    const presetHeading = await screen.findByRole(
      "heading",
      { name: /Chunk size 200 vs 1000 on the same corpus/i, level: 3 },
      { timeout: 20000 },
    );
    const presetCard = presetHeading.parentElement!.parentElement as HTMLElement;
    const tryThisButton = within(presetCard).getByRole("button", { name: /try this/i });

    // The chunking controls only mount once a document exists (`UploadAndIngest`'s
    // `!doc` EmptyState gate - correct product behaviour, not a bug). Seed one via
    // the paste-text path, which `ragApi.createDocument` is mocked above to
    // resolve deterministically without a network call.
    const pasteTextarea = screen.getByPlaceholderText(/Paste markdown or plain text/i);
    fireEvent.change(pasteTextarea, { target: { value: "# Preset test\n\nSample content for the chunk-size preset test." } });
    const createDocButton = screen.getByRole("button", { name: /Create document from pasted text/i });
    fireEvent.click(createDocButton);

    const chunkSizeInput = (await screen.findByLabelText(/Chunk size \(tokens\)/i, {}, { timeout: 20000 })) as HTMLInputElement;
    expect(chunkSizeInput.value).not.toBe("1000");

    fireEvent.click(tryThisButton);

    expect(chunkSizeInput.value).toBe("1000");
    cleanup();
  });
});
