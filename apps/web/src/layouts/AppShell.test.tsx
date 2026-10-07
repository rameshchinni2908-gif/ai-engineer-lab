import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { ThemeProvider } from "@/hooks/useTheme";
import { DifficultyProvider } from "@/hooks/useDifficulty";

function renderShell(initialEntry = "/") {
  return render(
    <ThemeProvider>
      <DifficultyProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route index element={<h1>Test page heading</h1>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </DifficultyProvider>
    </ThemeProvider>,
  );
}

describe("AppShell - accessibility basics", () => {
  it("renders a skip-to-content link that targets #main-content", () => {
    renderShell();
    const skipLink = screen.getByRole("link", { name: /skip to main content/i });
    expect(skipLink).toHaveAttribute("href", "#main-content");

    const main = document.getElementById("main-content");
    expect(main).toBeInTheDocument();
    expect(main?.tagName.toLowerCase()).toBe("main");
  });

  it("exposes exactly one <main> landmark and a labelled module nav landmark", () => {
    renderShell();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    const nav = screen.getByRole("navigation", { name: /modules/i });
    expect(within(nav).getAllByRole("link").length).toBe(13);
  });

  it("gives every interactive header control an accessible name", () => {
    renderShell();
    expect(screen.getByRole("radiogroup", { name: /content difficulty/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /switch to (dark|light) theme/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keyboard shortcuts/i })).toBeInTheDocument();
  });

  it("renders routed page content with exactly one <h1> (correct heading order)", () => {
    renderShell();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Test page heading");
  });
});
