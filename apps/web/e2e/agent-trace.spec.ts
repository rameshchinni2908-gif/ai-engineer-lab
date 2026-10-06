import { test, expect } from "@playwright/test";

/**
 * CLAUDE.md acceptance flow 3: "Run an agent and view its trace" (M6).
 * Runs the default ReAct agent configuration in the Playground tab and
 * asserts the Timeline view shows real per-step token/cost badges; then runs
 * the same goal via the Experiments tab's runtime-comparison panel, whose
 * summary line is the one place in the UI that surfaces the agent's actual
 * `stopReason` - asserting a terminal (non-"?") value proves the run reached
 * a real stop condition, not just "still streaming".
 */
test("running an agent streams a per-step trace and reaches a terminal stopReason", async ({ page }) => {
  await page.goto("/m/agents/playground");
  await expect(page.getByRole("heading", { name: /Agents \(\+ MCP\)/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Configure the agent" })).toBeVisible({ timeout: 20_000 });

  // Default tool allow-list (web_search, calculator) is pre-checked once the
  // tools query resolves - wait for at least one checkbox to exist before
  // running, so the Run button isn't disabled on "select at least one tool".
  await expect(page.locator('input[type="checkbox"]').first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /^Run agent \(Ctrl\/Cmd\+Enter\)$/ }).click();

  // Timeline tab is the default view inside "Live trace" - wait for at least
  // one real step row carrying a token-count badge (per-step tokens) and a
  // running-cost/token total (per-step cost). These badges only ever appear
  // inside the trace timeline on this page, so no extra scoping is needed.
  await expect(page.getByRole("heading", { name: "Live trace" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ tok/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/running total:/).first()).toBeVisible({ timeout: 30_000 });

  // Wait for the run itself to terminate (button label returns to idle) before
  // moving to the Experiments comparison, so the two runs don't race.
  await expect(page.getByRole("button", { name: /^Run agent \(Ctrl\/Cmd\+Enter\)$/ })).toBeVisible({ timeout: 30_000 });

  await page.goto("/m/agents/experiments");
  await expect(page.getByRole("heading", { name: "Compare two runtimes on the same goal" })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Run", exact: true }).first().click();

  const stopLine = page.getByText(/stop:\s*\S+/i).first();
  await expect(stopLine).toBeVisible({ timeout: 30_000 });
  const stopText = (await stopLine.innerText()).trim();
  const stopReasonMatch = /stop:\s*(\S+)/i.exec(stopText);
  const stopReason = stopReasonMatch?.[1];

  expect(stopReason, `expected a real terminal stopReason, got line: "${stopText}"`).toBeTruthy();
  expect(
    ["final", "max_steps", "budget", "timeout", "loop_detected", "error", "awaiting_approval"],
    `stopReason "${stopReason}" is not one of the documented AgentRun stop reasons (contracts.md §4 M6)`,
  ).toContain(stopReason);
  expect(stopReason).not.toBe("?"); // "?" is the UI's own fallback for "no stopReason on the Run yet"
});
