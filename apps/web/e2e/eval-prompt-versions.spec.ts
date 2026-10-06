import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * CLAUDE.md acceptance flow 4: "Run an eval across two prompt versions" (M7).
 *
 * The Evals playground's variant rows take a real `prompt_versions` row id
 * (validated server-side - `apps/api/src/services/evals/runner.ts` 404s on an
 * unknown id), and the Prompt Engineering UI never displays those raw ids
 * (only name/version badges). Two prompt versions are therefore created via
 * two direct `POST /api/prompting/prompt-versions` calls (ordinary test
 * *setup*, exactly as fixture data would be seeded for any other suite) so
 * their real ids can be read back and typed into the Evals UI - the eval
 * itself, the results matrix, and every assertion below run through the real
 * browser UI, not the API.
 */
async function createPromptVersion(request: APIRequestContext, name: string, template: string): Promise<string> {
  // Relative path: resolved against `use.baseURL` (the Vite dev server),
  // which proxies `/api/*` to the API (see `apps/web/vite.config.ts`) - the
  // exact same path the browser's own `fetch()` calls use, so this setup
  // request exercises the real proxy too, not a hardcoded second port.
  const res = await request.post("/api/prompting/prompt-versions", {
    data: { name, version: 1, template, variables: [], tags: ["e2e"] },
  });
  expect(res.ok(), `failed to create prompt version "${name}": ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.json()) as { id: string };
  return body.id;
}

test("running an eval suite across two prompt versions renders a per-variant results matrix", async ({
  page,
  request,
}) => {
  const suffix = Date.now();
  const pvA = await createPromptVersion(request, `e2e-eval-a-${suffix}`, "Answer concisely: {{q}}");
  const pvB = await createPromptVersion(request, `e2e-eval-b-${suffix}`, "You are terse. Answer: {{q}}");

  await page.goto("/m/evals/playground");
  await expect(page.getByRole("heading", { name: "Dataset manager" })).toBeVisible({ timeout: 20_000 });

  await page.locator("#dataset-name").fill(`e2e-dataset-${suffix}`);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.getByRole("heading", { name: /Import cases into/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText(/Imported \d+ case\(s\)/i)).toBeVisible({ timeout: 20_000 });

  await expect(page.getByRole("heading", { name: /Run an eval across prompt versions/i })).toBeVisible({
    timeout: 20_000,
  });

  await page.locator("#pv-v0").fill(pvA);
  await page.getByRole("button", { name: "+ Add variant" }).click();
  await page.locator("#pv-v1").fill(pvB);

  await page.getByRole("button", { name: /^Run eval suite$/ }).click();

  const table = page.getByRole("table");
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(table.getByRole("row", { name: /variant 0/ })).toBeVisible({ timeout: 30_000 });
  await expect(table.getByRole("row", { name: /variant 1/ })).toBeVisible({ timeout: 30_000 });

  // Per-variant metrics: the header row carries the selected metric ids
  // (exact_match/latency/cost by default), and each variant row must have a
  // non-placeholder ("-") value for at least one of them.
  await expect(table.getByRole("columnheader", { name: "exact_match" })).toBeVisible();
  const variant0Cells = table.getByRole("row", { name: /variant 0/ }).getByRole("cell");
  const variant1Cells = table.getByRole("row", { name: /variant 1/ }).getByRole("cell");
  const v0Texts = await variant0Cells.allInnerTexts();
  const v1Texts = await variant1Cells.allInnerTexts();
  expect(v0Texts.slice(1).some((t) => t !== "-"), `variant 0 row had no populated metric cells: ${v0Texts.join(",")}`).toBe(
    true,
  );
  expect(v1Texts.slice(1).some((t) => t !== "-"), `variant 1 row had no populated metric cells: ${v1Texts.join(",")}`).toBe(
    true,
  );

  await expect(page.getByText(/Total cost: \$/)).toBeVisible();
  await expect(page.getByText(/Total latency: /)).toBeVisible();
});
