import { test, expect, type Page } from "@playwright/test";

const modules = ["fundamentals", "prompting", "structured", "embeddings", "rag", "agents", "evals", "security", "production", "advanced", "checklist"];
const sections = ["learn", "playground", "experiments", "pitfalls"];

async function expectNoPageOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

for (const moduleId of modules) {
  test(`${moduleId}: every section fits a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    for (const section of sections) {
      await page.goto(`/m/${moduleId}/${section}`);
      await expect(page.getByRole("tabpanel").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expectNoPageOverflow(page);
      await expect(page.getByRole("button", { name: "Open Run Inspector" })).toBeInViewport();
      await expect(page.getByRole("tab", { name: "Experiments", exact: true }).first()).toBeInViewport();
      const center = page.getByTestId("module-shell-center");
      expect(await center.evaluate(el => getComputedStyle(el).overflowY)).toBe("visible");
    }
  });
}

test("bottom controls stay reachable as browser bars reduce the viewport", async ({ page }) => {
  await page.goto("/m/fundamentals/playground");
  const run = page.getByRole("button", { name: "Run (Ctrl/Cmd+Enter)", exact: true });
  for (const height of [664, 500, 320]) {
    await page.setViewportSize({ width: 390, height });
    await run.scrollIntoViewIfNeeded();
    await expect(run).toBeInViewport();
    const bounds = await run.boundingBox();
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expectNoPageOverflow(page);
  }
  const seed = page.locator("#sampling-seed");
  await seed.fill("42");
  expect(await seed.evaluate(el => getComputedStyle(el).fontSize)).toBe("16px");
  await page.screenshot({ path: `test-results/mobile-bottom-${test.info().project.name}.png` });
});

test("iPhone install action provides home-screen steps", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Install app", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Add to Home Screen/)).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).not.toBeVisible();
});

test("desktop panes fit and collapsed panes release space", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${test.info().project.use.baseURL}/m/fundamentals/playground`);
  const center = page.getByTestId("module-shell-center");
  await expect(center).toBeVisible();
  const initial = await center.boundingBox();
  expect(initial?.width).toBeGreaterThan(400);
  const inspector = await page.getByRole("complementary", { name: "Run Inspector and explanation" }).boundingBox();
  expect((initial?.x ?? 0) + (initial?.width ?? 0)).toBeLessThanOrEqual(inspector?.x ?? 0);
  await page.getByRole("button", { name: "Collapse Learn pane" }).click();
  await page.getByRole("button", { name: "Collapse Inspector pane" }).click();
  expect((await center.boundingBox())?.width).toBeGreaterThan((initial?.width ?? 0) + 200);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("button", { name: "Expand Learn pane" }).click();
  await page.getByRole("button", { name: "Expand Inspector pane" }).click();
  expect((await center.boundingBox())?.width).toBeGreaterThan(300);
  await expectNoPageOverflow(page);
  await page.screenshot({ path: `test-results/tablet-${test.info().project.name}.png` });
  await page.close();
});

test("small phones and landscape keep navigation and dialogs accessible", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 740, height: 360 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/m/checklist/experiments");
    await expect(page.getByRole("tab", { name: "System-design scenarios" })).toBeVisible();
    await expectNoPageOverflow(page);
    await page.getByRole("button", { name: "Open module navigation" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
    await dialog.getByRole("link", { name: "Run history", exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("link", { name: "Run history", exact: true })).toBeInViewport();
    await dialog.getByRole("link", { name: "Run history", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(/\/runs$/);
  }
});

test("home-screen metadata and cached lessons work offline without caching the API", async ({ page, context, browserName }) => {
  await page.goto("/");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();
  const manifestResponse = await page.request.get(manifestHref!);
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toEqual(expect.arrayContaining([expect.objectContaining({ sizes: "192x192" }), expect.objectContaining({ sizes: "512x512", purpose: "maskable" })]));
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  if (browserName === "webkit") {
    // Playwright #42775: WebKit rejects offline document navigation even
    // when a service worker supplies it. Test cached navigation online,
    // then offline tab interaction in the already-loaded module.
    await page.goto("/m/fundamentals/learn");
  }
  await context.setOffline(true);
  if (browserName !== "webkit") await page.goto("/m/fundamentals/learn");
  await expect(page.getByRole("heading", { name: "LLM Fundamentals", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Pitfalls", exact: true }).click();
  await expect(page).toHaveURL(/\/pitfalls$/);
  const cachedUrls = await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = await Promise.all(keys.map(async key => (await caches.open(key)).keys()));
    return requests.flat().map(request => new URL(request.url).pathname);
  });
  expect(cachedUrls.some(path => path.startsWith("/api/"))).toBe(false);
  const apiFailed = await page.evaluate(async () => {
    try { await fetch("/api/health"); return false; } catch { return true; }
  });
  expect(apiFailed).toBe(true);
});
