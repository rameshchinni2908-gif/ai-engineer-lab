import { test, expect, type Page, type Locator } from "@playwright/test";

async function action(page: Page, button: Locator, path: string, streamed = false): Promise<string> {
  await expect(button).toBeEnabled();
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === `/api${path}` && response.request().method() === "POST", { timeout: 30_000 });
  await button.click();
  const response = await responsePromise;
  const body = await response.text();
  expect(response.status(), `${path}: ${body.slice(0, 300)}`).toBeLessThan(300);
  if (streamed) {
    expect(response.headers()["content-type"]).toContain("text/event-stream");
    expect(body).toContain("event: done");
    expect(body, `${path} must not emit an unexpected error`).not.toContain("event: error");
  }
  await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
  return body;
}

function button(page: Page, name: string): Locator {
  return page.getByRole("main").getByRole("button", { name, exact: true });
}

test("fundamentals: tokenize, context fit, sample, and compare models", async ({ page }) => {
  await page.goto("/m/fundamentals/playground");
  await action(page, button(page, "Tokenize"), "/fundamentals/tokenize");
  await action(page, button(page, "Check fit"), "/fundamentals/context-window");
  await action(page, button(page, "Run (Ctrl/Cmd+Enter)"), "/fundamentals/sample", true);
  await page.goto("/m/fundamentals/experiments");
  await action(page, button(page, "Compare (Ctrl/Cmd+Enter)"), "/fundamentals/compare-models", true);
});

test("prompting: count, generate, coach, save, and render templates", async ({ page }) => {
  await page.goto("/m/prompting/playground");
  await action(page, button(page, "Count tokens"), "/fundamentals/tokenize");
  await action(page, button(page, "Run (Ctrl/Cmd+Enter)"), "/prompting/technique-demo", true);
  await action(page, button(page, "Coach this prompt"), "/prompting/coach");
  await page.goto("/m/prompting/experiments");
  await action(page, button(page, "Save version 1"), "/prompting/prompt-versions");
  await action(page, button(page, "Render both versions"), "/prompting/render");
});

test("structured: all output modes, validation, tools, and repair", async ({ page }) => {
  await page.goto("/m/structured/playground");
  for (let i = 0; i < 3; i++) {
    await action(page, page.getByRole("button", { name: /Run trial/ }).nth(i), "/structured/generate", true);
  }
  await action(page, button(page, "Validate"), "/structured/validate");
  await action(page, button(page, "Ask (Ctrl/Cmd+Enter)"), "/structured/tool-call", true);
  await page.goto("/m/structured/experiments");
  await action(page, button(page, "Run repair loop (Ctrl/Cmd+Enter)"), "/structured/repair", true);
});

test("embeddings: projection, similarity, chunks, index comparison, and hybrid retrieval", async ({ page }) => {
  await page.goto("/m/embeddings/playground");
  await action(page, button(page, "Embed & project"), "/embeddings/project-2d");
  await action(page, button(page, "Compute all 3 metrics"), "/embeddings/similarity");
  await action(page, button(page, "Preview chunks"), "/embeddings/chunk-preview");
  await page.goto("/m/embeddings/experiments");
  const comparison = button(page, "Run Flat vs HNSW vs IVF comparison");
  await comparison.click();
  await expect(comparison).toBeEnabled({ timeout: 90_000 });
  await expect(page.getByRole("columnheader", { name: "Recall vs Flat" })).toBeVisible();
  await expect(page.locator('main .text-destructive').filter({ hasText: /Too many requests|failed|error/i })).toHaveCount(0);
  await action(page, button(page, "Run hybrid search"), "/vector/hybrid-search");
  await action(page, button(page, "Rerank the fused results"), "/vector/rerank");
});

test("rag: seeded retrieval and every failure-mode experiment", async ({ page }) => {
  await page.goto("/m/rag/playground");
  await action(page, button(page, "Run query (Ctrl/Cmd+Enter)"), "/rag/query", true);
  await page.goto("/m/rag/experiments");
  for (const name of ["Retrieval miss", "Ignored context", "Stale index"]) {
    await action(page, button(page, name), "/rag/failure-mode-demo");
  }
});

test("agents: run both runtimes and call an MCP tool", async ({ page }) => {
  await page.goto("/m/agents/playground");
  await action(page, button(page, "Run agent (Ctrl/Cmd+Enter)"), "/agents/run", true);
  await page.goto("/m/agents/experiments");
  await action(page, button(page, "Run").first(), "/agents/run", true);
  await action(page, button(page, "Run").nth(1), "/agents/run", true);
  await page.getByRole("textbox", { name: "Arguments for search_docs" }).fill('{"query":"MCP"}');
  const toolResponse = page.waitForResponse(response => response.url().includes("/api/mcp/") && response.request().method() === "POST");
  await button(page, "Call tool").first().click();
  const toolResult = await toolResponse;
  expect(toolResult.status()).toBe(200);
  expect((await toolResult.json()).isError).toBe(false);
});

test("evals: select a real saved prompt, run a populated dataset, and exercise judge demos", async ({ page }) => {
  await page.goto("/m/evals/playground");
  await page.getByRole("button", { name: "Nimbus Support QA", exact: true }).click();
  await page.getByRole("combobox", { name: "Choose saved prompt for variant 0" }).click();
  await page.getByRole("option", { name: /nimbus-support-assistant-baseline/ }).click();
  await action(page, button(page, "Run eval suite"), "/evals/run", true);
  await page.goto("/m/evals/experiments");
  await action(page, button(page, "Run demo").first(), "/evals/judge-bias-demo");
  await action(page, button(page, "Run demo").nth(1), "/evals/judge-bias-demo");
  await action(page, button(page, "Run demo (anthropic judging anthropic)"), "/evals/judge-bias-demo");
  await action(page, button(page, "Calibrate"), "/evals/judge-calibration");
});

test("security: undefended attack and defended re-run, plus audit history", async ({ page }) => {
  await page.goto("/m/security/playground");
  await button(page, "Disable all (undefended)").click();
  await action(page, button(page, "Run attack (Ctrl/Cmd+Enter)"), "/guardrails/attack", true);
  await button(page, "Enable all (fully defended)").click();
  await action(page, button(page, "Run attack (Ctrl/Cmd+Enter)"), "/guardrails/attack", true);
  await page.goto("/m/security/experiments");
  await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
});

test("production: cache measurement, reliability, latency stream, and traces", async ({ page }) => {
  await page.goto("/m/production/playground");
  await action(page, button(page, "Run cold vs. cached (measured)"), "/production/cache-sim");
  await page.getByRole("tab", { name: "Reliability lab", exact: true }).click();
  const simulate = button(page, "Run reliability sim");
  await action(page, simulate, "/production/reliability-sim");
  await page.getByRole("tab", { name: "Latency lab", exact: true }).click();
  await action(page, button(page, "Run and measure"), "/production/latency-lab/run", true);
  await page.goto("/m/production/experiments");
  await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
});

test("advanced: heatmap, quantization, multimodal, reasoning, and synthetic data", async ({ page }) => {
  await page.goto("/m/advanced/playground");
  await action(page, button(page, "Compute illustrative heatmap"), "/advanced/attention-heatmap");
  await page.getByRole("tab", { name: "Quantization & local models", exact: true }).click();
  await action(page, page.getByRole("button", { name: /Compare|Estimate|Compute/ }).first(), "/advanced/quantization-demo");
  await page.getByRole("tab", { name: "Multimodal", exact: true }).click();
  await action(page, button(page, "Send"), "/advanced/multimodal-demo", true);
  await page.getByRole("tab", { name: "Reasoning budgets", exact: true }).click();
  await action(page, button(page, "Run"), "/fundamentals/sample", true);
  await page.getByRole("tab", { name: "Synthetic data", exact: true }).click();
  await action(page, page.getByRole("button", { name: /Generate|Run/ }).last(), "/advanced/synthetic-data", true);
  await page.goto("/m/advanced/experiments");
  await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
});

test("checklist: quiz submission and design scenarios", async ({ page }) => {
  await page.goto("/m/checklist/playground");
  await page.getByRole("tab", { name: "Quizzes", exact: true }).click();
  const groups = page.getByRole("main").getByRole("group");
  for (let i = 0; i < await groups.count(); i++) await groups.nth(i).getByRole("radio").first().click();
  const response = page.waitForResponse(r => r.url().includes("/api/checklist/quiz/") && r.request().method() === "POST");
  await page.getByRole("button", { name: /Submit|Grade/ }).click();
  expect((await response).status()).toBe(200);
  await page.goto("/m/checklist/experiments");
  await page.getByRole("tab", { name: "System-design scenarios", exact: true }).click();
  await page.getByRole("button", { name: /reveal the reference architecture/i }).click();
  await expect(page.getByRole("img", { name: /Reference architecture/ })).toBeVisible();
});
