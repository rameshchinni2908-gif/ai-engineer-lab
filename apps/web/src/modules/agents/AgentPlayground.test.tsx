import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui";
import { AgentPlayground } from "./AgentPlayground";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

function renderPlayground(appliedParams?: Parameters<typeof AgentPlayground>[0]["appliedParams"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <AgentPlayground appliedParams={appliedParams} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("AgentPlayground - applying a preset must not drop falsy values", () => {
  // `maxSteps: 0` is not reachable by typing into the real `<Input min={1} …>`
  // control (its onChange handler coerces a falsy parse back to `1`), so this
  // exercises the `appliedParams` prop contract directly - the same path a
  // `<PresetPicker>` selection uses - rather than a user-reachable keystroke.
  // That prop contract is exactly what regresses if the effect goes back to
  // truthiness checks.
  it("applies maxSteps: 0 from appliedParams instead of silently keeping the previous value", async () => {
    renderPlayground({ maxSteps: 0 });

    const maxStepsInput = await screen.findByLabelText(/maxSteps/i, {}, { timeout: 20000 });
    expect(maxStepsInput).toHaveValue(0);

    cleanup();
  });

  it("applies goal: \"\" from appliedParams instead of silently keeping the previous value", async () => {
    renderPlayground({ goal: "" });

    const goalInput = await screen.findByLabelText(/^Goal$/i, {}, { timeout: 20000 });
    expect(goalInput).toHaveValue("");

    cleanup();
  });
});
