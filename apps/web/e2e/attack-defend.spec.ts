import { test, expect } from "@playwright/test";

/**
 * CLAUDE.md acceptance flow 5: "Attack a bot with injection, enable
 * defenses, re-run" (M8). Runs the default attack (direct prompt injection
 * trying to reveal a secret) against the fully undefended demo bot and
 * asserts it succeeds; then enables every defense layer via "Enable all
 * (fully defended)" and re-runs the SAME attack, asserting it is now
 * blocked AND that the blocking layer is named in the UI.
 *
 * Deliberately runs at the project default viewport (`devices["Desktop Chrome"]`,
 * 1280x720). This spec previously forced 1920x1200 to dodge a real layout bug where
 * the Run Inspector <aside> overlapped the center column and swallowed clicks. That
 * bug is fixed (overflow containment in `ModuleShell`/`ui/select.tsx`), so the
 * override is gone - and its absence is now the regression test: if the overlap
 * returns, the "Enable all (fully defended)" click below starts failing again.
 */

test("the same attack succeeds undefended, then is blocked once defenses are enabled", async ({ page }) => {
  // Regression guard for the config race that USED to live here: the playground
  // applied `GET /guardrails/config` to local state once the query resolved, with no
  // guard against the user having already changed a toggle, so a late response
  // silently reverted a manual change. The old workaround was to await that response
  // before touching anything. That wait is deliberately REMOVED: the test now races
  // the request on purpose, exactly as a fast user on a slow network would. It passes
  // because `AttackPlayground` records explicit user intent and makes the server
  // response incapable of overwriting it.
  await page.goto("/m/security/playground");
  await expect(page.getByRole("heading", { name: /Guardrails & Security/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Attack the demo bot" })).toBeVisible({ timeout: 20_000 });

  // Fresh e2e database -> `GET /guardrails/config` has no persisted row yet,
  // so the playground starts from DEFAULT_GUARDRAIL_CONFIG (every layer off) -
  // confirm that starting point explicitly via the toggle panel's own
  // "Disable all" state rather than assuming it.
  await page.getByRole("button", { name: "Disable all (undefended)" }).click();

  const runAttack = page.getByRole("button", { name: /^Run attack \(Ctrl\/Cmd\+Enter\)$/ });
  await runAttack.click();

  await expect(page.getByRole("heading", { name: "Attack SUCCEEDED" })).toBeVisible({ timeout: 20_000 });

  // This click is the overlap regression test. At 1280x720 with a completed run
  // populating the inspector, this button was previously unclickable: Playwright
  // logged '<aside aria-label="Run Inspector and explanation"> intercepts pointer
  // events' and retried for ~60s, and even `force: true` landed without updating any
  // switch. No `force` here on purpose - a forced click would mask a return of the
  // bug, which is the opposite of what this line is for.
  await page.getByRole("button", { name: "Enable all (fully defended)" }).click();
  // Fail fast with a clear message here (rather than a confusing 20s
  // "Attack BLOCKED never appeared" below) if the config race above recurs.
  await expect(page.locator("#layer-injectionClassifier")).toBeChecked({ timeout: 5_000 });

  await runAttack.click();

  await expect(page.getByRole("heading", { name: "Attack BLOCKED" })).toBeVisible({ timeout: 20_000 });
  const blockedAlert = page.getByText(/Stopped by:/i);
  await expect(blockedAlert).toBeVisible({ timeout: 20_000 });
  const blockedText = await blockedAlert.innerText();
  expect(blockedText, "the UI must name which guardrail layer blocked the attack").toMatch(/Stopped by:\s*\S+/i);

  // The guardrail pipeline trace independently names the same blocking layer
  // with an explicit "block" finding, not just the summary alert.
  await expect(page.getByRole("heading", { name: /Guardrail pipeline trace/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("block", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
});
