import { test, expect, type Locator } from "@playwright/test";

/**
 * CLAUDE.md acceptance flow 1: "Change temperature and see token-probability
 * shifts" (M1 sampling lab). Runs the SAME prompt + seed at temperature 0
 * (greedy) and at temperature 2 (max), and asserts two independent,
 * content-agnostic signals that the displayed probabilities/sampled tokens
 * actually changed:
 *
 *  1. The logprob bar chart's chosen-token bar is visibly shorter at high
 *     temperature than at temperature 0 (the mock provider's softmax over
 *     `baseLogit / temperature` always keeps the SAME top candidate - dividing
 *     all logits by a positive constant preserves order - so only the bar's
 *     MAGNITUDE should differ, never which token is tallest; see
 *     `apps/api/src/providers/sampling.ts`).
 *  2. The full generated text differs between the two runs (same seed): mock
 *     generation only forces the greedy/template word at EVERY slot when
 *     temperature is ~0; at temperature 2 the flattened distribution makes at
 *     least one "variable" slot sample a different word.
 *
 * Neither assertion depends on the exact wording of the mock's output.
 */
test("temperature change visibly shifts the sampled output and the logprob bar heights", async ({ page }) => {
  await page.goto("/m/fundamentals/playground");
  await expect(page.getByRole("heading", { name: "Sampling lab" })).toBeVisible({ timeout: 20_000 });

  const seedInput = page.locator("#sampling-seed");
  await seedInput.fill("42");

  // First slider on this tab is Temperature (top_p, presence, and frequency
  // penalty sliders follow it in DOM order in SamplingLab.tsx); scope the
  // generic `role=slider` locator rather than relying on an accessible name,
  // since the <Slider> here has no `aria-label`.
  const temperatureSlider = page.getByRole("slider").first();

  async function runAtTemperatureExtreme(key: "Home" | "End"): Promise<{ text: string; barHeight: number }> {
    await temperatureSlider.focus();
    await temperatureSlider.press(key);

    await page.getByRole("button", { name: /^Run \(Ctrl\/Cmd\+Enter\)$/ }).click();
    // Wait for the "tok/s:" usage badge rather than the throttled sr-only
    // StreamingRegion announcement: both only render once `run_complete` has
    // populated `r.run`, but the announcement goes through an extra
    // effect-scheduled re-render that was observed to lag well behind the
    // badges under CPU contention, making it the flakier of the two signals
    // for the exact same underlying completion event.
    await expect(page.getByText(/tok\/s:/)).toBeVisible({ timeout: 45_000 });

    // Let recharts' mount animation settle so the bar's bounding box reflects
    // its final (not mid-animation) height before we measure it.
    await page.waitForTimeout(900);

    const text = await page.locator('div[aria-hidden="true"].whitespace-pre-wrap').first().innerText();
    const chosenBar: Locator = page.locator(".recharts-rectangle").first();
    await expect(chosenBar).toBeVisible({ timeout: 20_000 });
    const box = await chosenBar.boundingBox();
    if (!box) throw new Error("chosen probability bar has no bounding box");
    return { text, barHeight: box.height };
  }

  const greedy = await runAtTemperatureExtreme("Home"); // temperature = 0
  const hot = await runAtTemperatureExtreme("End"); // temperature = 2 (max)

  expect(greedy.text, "same seed/prompt at temp 0 vs temp 2 must not sample identical text").not.toBe(hot.text);
  expect(
    greedy.barHeight,
    `chosen-token bar should be much taller near-greedy (${greedy.barHeight}px) than at temp 2 (${hot.barHeight}px)`,
  ).toBeGreaterThan(hot.barHeight + 10);
});
