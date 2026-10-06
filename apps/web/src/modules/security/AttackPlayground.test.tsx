import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GuardrailConfig } from "@ail/shared";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Controllable, test-assigned promise so we can resolve `GET
// /guardrails/config` at a precise moment (AFTER the user has already
// toggled a layer by hand) rather than racing real `fetch` timing.
let configPromise: Promise<GuardrailConfig>;

vi.mock("./api", () => ({
  getGuardrailConfig: () => configPromise,
  listAttacks: () =>
    Promise.resolve({
      attacks: [
        {
          id: "direct-injection-reveal-secret",
          name: "Direct injection: reveal the system secret",
          category: "direct_injection",
          owaspId: "LLM01",
          description: "test",
        },
      ],
    }),
}));

const { AttackPlayground, FALLBACK_CONFIG } = await import("./AttackPlayground");

function renderPlayground() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AttackPlayground />
    </QueryClientProvider>,
  );
}

describe("AttackPlayground - config fetch cannot clobber user intent", () => {
  it("a late-resolving GET /guardrails/config response does NOT overwrite a layer the user already toggled on (state-precedence rule: user interaction always wins once it happens)", async () => {
    let resolveConfig!: (value: GuardrailConfig) => void;
    configPromise = new Promise<GuardrailConfig>((resolve) => {
      resolveConfig = resolve;
    });

    renderPlayground();

    const switchEl = await screen.findByRole("switch", { name: /Input validation/i }, { timeout: 20000 });
    expect(switchEl).toHaveAttribute("aria-checked", "false");

    // User interacts BEFORE the server response arrives.
    fireEvent.click(switchEl);
    expect(switchEl).toHaveAttribute("aria-checked", "true");

    // The slow server response now lands, reporting the layer OFF (the
    // server's own persisted idea of "current"). Per the precedence rule,
    // this must be a no-op once the user has already interacted.
    //
    // IMPORTANT: this is deliberately NOT a `waitFor` assertion. `waitFor`
    // exits on the FIRST passing check, which would trivially "pass" here
    // before the resolved promise's effect has even flushed - exactly the
    // kind of test that would still pass against the buggy code. Instead,
    // explicitly flush the promise resolution + the resulting effect/render
    // inside `act`, THEN assert the final, settled DOM state directly.
    await act(async () => {
      resolveConfig({ ...FALLBACK_CONFIG, inputValidation: false });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(switchEl).toHaveAttribute("aria-checked", "true");

    cleanup();
  });

  it("(sanity check) a config response that arrives BEFORE any user interaction DOES seed the initial toggle state", async () => {
    configPromise = Promise.resolve({ ...FALLBACK_CONFIG, inputValidation: true });

    renderPlayground();

    const switchEl = await screen.findByRole("switch", { name: /Input validation/i }, { timeout: 20000 });
    await waitFor(
      () => {
        expect(switchEl).toHaveAttribute("aria-checked", "true");
      },
      { timeout: 20000 },
    );

    cleanup();
  });
});
