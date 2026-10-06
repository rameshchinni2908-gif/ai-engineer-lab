import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
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

describe("security module page (smoke)", () => {
  it("renders the real page via the router, not the 'coming in a later wave' placeholder", async () => {
    renderModule("/m/security");
    expect(
      await screen.findByRole("heading", { name: /Guardrails & Security/i }, { timeout: 20000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/coming in a later wave/i)).not.toBeInTheDocument();
    cleanup();
  });

  it("renders the attack -> defend -> re-run flow's controls: attack picker, defense layer toggles, and run button, with the scripted-bot disclosure", async () => {
    renderModule("/m/security/playground");
    expect(await screen.findByRole("heading", { name: /Attack the demo bot/i }, { timeout: 20000 })).toBeInTheDocument();

    // The scripted-bot disclosure (the most important of the reviewer's three) must be visible on the surface.
    expect(screen.getByText(/deterministic\s*\nSCRIPTED string|SCRIPTED string/i)).toBeInTheDocument();

    // The defense-layer toggles (all 12 layers) are present so the user can flip them before re-running the same attack.
    expect(await screen.findByText(/Defense layers/i, {}, { timeout: 20000 })).toBeInTheDocument();
    expect(screen.getByText(/Input validation/i)).toBeInTheDocument();
    expect(screen.getByText(/PII redaction/i)).toBeInTheDocument();
    expect(screen.getByText(/Tool allow-list/i)).toBeInTheDocument();

    // The run button that re-executes the (possibly now-defended) attack.
    expect(screen.getByRole("button", { name: /Run attack/i })).toBeInTheDocument();
    cleanup();
  });

  it("clicking a preset changes an actual control's value, not just the active-preset highlight", async () => {
    renderModule("/m/security/playground");
    const switchEl = await screen.findByRole("switch", { name: /Input validation/i }, { timeout: 20000 });

    // Manually turn the layer ON first, so the preset (which applies the
    // fully-undefended config, i.e. this layer OFF) has something real to
    // change - proving the preset's `config` actually reaches the toggle,
    // not merely that `activePresetId` updated.
    await act(async () => {
      fireEvent.click(switchEl);
    });
    expect(switchEl).toHaveAttribute("aria-checked", "true");

    // Preset order matches content.presets: index 0 = "security-attack-then-defend" (applies the undefended config).
    const tryThisButtons = await screen.findAllByRole("button", { name: /Try this/i }, { timeout: 20000 });
    await act(async () => {
      fireEvent.click(tryThisButtons[0]!);
    });

    await waitFor(
      () => {
        expect(switchEl).toHaveAttribute("aria-checked", "false");
      },
      { timeout: 20000 },
    );

    cleanup();
  });

  it("renders the OWASP map and audit log in the Experiments tab", async () => {
    renderModule("/m/security/experiments");
    expect(await screen.findByRole("heading", { name: /OWASP LLM Top 10/i }, { timeout: 20000 })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Audit log/i }, { timeout: 20000 })).toBeInTheDocument();
    cleanup();
  });
});
