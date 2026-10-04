import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import HomePage from "./HomePage";

describe("HomePage", () => {
  it("renders the app title and all 11 module entries", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("AI Engineer Lab")).toBeInTheDocument();
    expect(screen.getByText("LLM Fundamentals")).toBeInTheDocument();
    expect(screen.getByText("Glossary & Senior Checklist")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(11);
  });
});
