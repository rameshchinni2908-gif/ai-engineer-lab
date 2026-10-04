import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ExplainRunResponse } from "@ail/shared";
import { WhyThisHappened } from "./WhyThisHappened";
import { DifficultyProvider } from "@/hooks/useDifficulty";

function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <DifficultyProvider>{ui}</DifficultyProvider>
    </QueryClientProvider>,
  );
}

const SAMPLE_EXPLAIN: ExplainRunResponse = {
  runId: "run_42",
  summary: "This run used temperature 0.9 with 3 samples, which is why outputs diverged sharply.",
  factors: [
    {
      label: "temperature",
      value: "0.9",
      impact: "increased",
      detail: "0.9 is high, so token probabilities were flattened and sampling diverged across runs.",
    },
    {
      label: "topP",
      value: "1",
      impact: "neutral",
      detail: "top_p of 1 did not restrict the candidate pool beyond temperature's effect.",
    },
  ],
  whatToTryNext: ["Lower temperature to 0.3 and re-run to compare determinism.", "Set a fixed seed for reproducibility."],
};

describe("WhyThisHappened", () => {
  it("renders the real run's summary, factor values/impacts, and next-step suggestions - never generic text", () => {
    renderWithProviders(<WhyThisHappened explain={SAMPLE_EXPLAIN} />);

    // tied to the ACTUAL run's values, not generic boilerplate
    expect(screen.getByText(/temperature 0\.9 with 3 samples/i)).toBeInTheDocument();
    expect(screen.getByText(/temperature: 0\.9/i)).toBeInTheDocument();
    expect(screen.getByText(/flattened and sampling diverged/i)).toBeInTheDocument();
    expect(screen.getByText(/\(increased\)/i)).toBeInTheDocument();
    expect(screen.getByText(/\(no clear effect\)/i)).toBeInTheDocument();

    expect(screen.getByText(/Lower temperature to 0\.3/i)).toBeInTheDocument();
    expect(screen.getByText(/Set a fixed seed/i)).toBeInTheDocument();
  });

  it("shows an empty state when there is nothing to explain yet", () => {
    renderWithProviders(<WhyThisHappened />);
    expect(screen.getByText(/nothing to explain yet/i)).toBeInTheDocument();
  });

  it("prefers the difficulty-specific variant summary when provided", () => {
    const withVariants: ExplainRunResponse = {
      ...SAMPLE_EXPLAIN,
      variants: {
        beginner: "Simple explanation for beginners.",
        intermediate: "Simple explanation for beginners.",
        senior: "Simple explanation for beginners.",
      },
    };
    renderWithProviders(<WhyThisHappened explain={withVariants} />);
    expect(screen.getByText("Simple explanation for beginners.")).toBeInTheDocument();
  });
});
