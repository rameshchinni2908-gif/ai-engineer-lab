import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ModuleRoute } from "./router";

/**
 * Verifies the hard requirement from the orchestrator brief: the app must
 * build and route correctly with ZERO files under `src/modules/` (which is
 * the real state of this repo as of Wave 1 - no Wave 2 module has landed
 * yet). `import.meta.glob` finds no matches, so every module route must
 * degrade to the "coming in a later wave" placeholder instead of crashing.
 */
describe("ModuleRoute (no src/modules/* present)", () => {
  it("renders a graceful placeholder for a known, but not-yet-implemented, moduleId", () => {
    render(
      <MemoryRouter initialEntries={["/m/rag"]}>
        <Routes>
          <Route path="/m/:moduleId" element={<ModuleRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/RAG/i)).toBeInTheDocument();
    expect(screen.getByText(/coming in a later wave/i)).toBeInTheDocument();
  });

  it("renders the placeholder consistently across all 11 moduleIds", () => {
    const ids = [
      "fundamentals",
      "prompting",
      "structured",
      "embeddings",
      "rag",
      "agents",
      "evals",
      "security",
      "production",
      "advanced",
      "checklist",
    ];
    for (const id of ids) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[`/m/${id}`]}>
          <Routes>
            <Route path="/m/:moduleId" element={<ModuleRoute />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByText(/coming in a later wave/i)).toBeInTheDocument();
      unmount();
    }
  });

  it("falls back to a 404-shaped result for an unknown moduleId rather than crashing", () => {
    render(
      <MemoryRouter initialEntries={["/m/not-a-real-module"]}>
        <Routes>
          <Route path="/m/:moduleId" element={<ModuleRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("404")).toBeInTheDocument();
  });
});
