import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DifficultyToggle } from "./DifficultyToggle";
import { DifficultyProvider, useDifficulty } from "@/hooks/useDifficulty";
import { useDifficultyStore } from "@/stores/difficulty";

const SUMMARY = {
  beginner: "Beginner-depth explanation.",
  intermediate: "Intermediate-depth explanation.",
  senior: "Senior-depth explanation with gotchas.",
};

/** Stand-in for a module's Learn content, reacting to the global difficulty exactly like real content would. */
function ReactiveLearnContent(): JSX.Element {
  const { pick } = useDifficulty();
  return <p>{pick(SUMMARY)}</p>;
}

describe("DifficultyToggle", () => {
  beforeEach(() => {
    useDifficultyStore.setState({ difficulty: "intermediate" });
    localStorage.clear();
  });

  it("switches reactive content depth when a new level is selected", () => {
    render(
      <DifficultyProvider>
        <DifficultyToggle />
        <ReactiveLearnContent />
      </DifficultyProvider>,
    );

    // default is "intermediate"
    expect(screen.getByText(SUMMARY.intermediate)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Senior" }));
    expect(screen.getByText(SUMMARY.senior)).toBeInTheDocument();
    expect(screen.queryByText(SUMMARY.intermediate)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Beginner" }));
    expect(screen.getByText(SUMMARY.beginner)).toBeInTheDocument();
  });

  it("marks the active level with aria-checked for a11y", () => {
    render(
      <DifficultyProvider>
        <DifficultyToggle />
      </DifficultyProvider>,
    );

    expect(screen.getByRole("radio", { name: "Intermediate" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Beginner" }));
    expect(screen.getByRole("radio", { name: "Beginner" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Intermediate" })).toHaveAttribute("aria-checked", "false");
  });
});
