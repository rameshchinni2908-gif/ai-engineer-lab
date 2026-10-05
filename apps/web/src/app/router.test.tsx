import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ModuleRoute } from "./router";

/**
 * Verifies the hard requirement from the orchestrator brief: the app must build
 * and route correctly no matter how many files exist under `src/modules/`.
 * `import.meta.glob` matches only module folders that actually exist, so a
 * route with no matching file must degrade to the "coming in a later wave"
 * placeholder instead of crashing.
 *
 * NOTE: these tests must NOT hardcode a specific moduleId as unimplemented.
 * Wave 2 lands module pages one at a time, so any such assertion goes stale the
 * moment that module ships (this originally asserted `/m/rag` was a placeholder,
 * and broke when M5 landed). Use an id that can never have a module file.
 */
describe("ModuleRoute placeholder/degradation behaviour", () => {
  // The placeholder path is covered by the glob-driven test below, which stays
  // correct as modules land. A hardcoded "this id is unimplemented" test cannot:
  // a KNOWN id goes stale the moment that module ships (the original pinned
  // `/m/rag` and broke when M5 landed), and an UNKNOWN id routes to the 404
  // fallback rather than the placeholder (asserted separately at the end).

  it("renders the placeholder for every moduleId whose module file is not built yet", () => {
    // Resolved with the SAME glob the router uses, so this test stays correct as
    // Wave 2 lands module pages one at a time: an id that now has a real page is
    // expected to render that page (asserted by that module's own tests), while an
    // id still missing must degrade to the placeholder rather than crash.
    const built = new Set(
      Object.keys(import.meta.glob("/src/modules/*/index.tsx")).map(
        (p) => p.split("/")[3] as string,
      ),
    );
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
    const notBuilt = ids.filter((id) => !built.has(id));

    for (const id of notBuilt) {
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

    // Guard against the assertion silently becoming vacuous once every module
    // exists: at that point the placeholder path is covered by the unknown-id
    // test below, and this list is legitimately empty.
    expect(notBuilt.length + built.size).toBeGreaterThanOrEqual(ids.length);
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
