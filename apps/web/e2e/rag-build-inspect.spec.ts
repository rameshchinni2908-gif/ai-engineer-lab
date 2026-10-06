import { test, expect } from "@playwright/test";

/**
 * CLAUDE.md acceptance flow 2: "Build a RAG pipeline and inspect retrieval"
 * (M5). Ingests a small pasted document through the full pipeline
 * (create -> chunk -> embed -> index), then runs a query and asserts:
 *  - retrieved chunks/citations are actually shown (non-empty list, count
 *    assertable), and
 *  - per-stage inspection is populated (the "Pipeline stages" panel lists
 *    more than one real SSE `stage` event for this run).
 */
test("upload, chunk, embed, index a document, then query it and inspect every stage", async ({ page }) => {
  const docName = `e2e-doc-${Date.now()}.md`;

  await page.goto("/m/rag/playground");
  await expect(page.getByRole("heading", { name: /^RAG$/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /Upload & ingest/i })).toBeVisible({ timeout: 20_000 });

  await page.locator("#rag-paste-name").fill(docName);
  await page
    .getByPlaceholder("Paste markdown or plain text...")
    .fill(
      "# Vector databases\n\nA vector database stores embeddings and supports approximate nearest-neighbour search. " +
        "It is the retrieval backbone of RAG systems. Qdrant and an in-memory store are two examples used in this app.",
    );
  await page.getByRole("button", { name: "Create document from pasted text" }).click();

  await expect(page.getByRole("heading", { name: `Document: ${docName}` })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "1. Chunk" }).click();
  await expect(page.getByText(/chunk\(s\) produced/i)).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /^2\. Embed/ }).click();
  await expect(page.getByRole("button", { name: /^2\. Embed ✓/ })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /^3\. Index/ }).click();
  await expect(page.getByText(/Indexed into/i)).toBeVisible({ timeout: 20_000 });

  // Query playground: same Playground tab, below Upload & ingest. Strategy is
  // switched to HyDE (rather than left on the default "basic") specifically
  // because `retrieve()` only pushes a single "retrieve" stage for "basic"
  // (apps/api/src/services/rag/retrieval.ts) - HyDE adds a "rewrite" stage
  // first, giving a genuine multi-stage pipeline to inspect.
  await page.locator("#rag-strategy").click();
  await page.getByRole("option", { name: "HyDE" }).click();

  await page.locator("#rag-query-input").fill("What does a vector database support?");
  await page.getByRole("button", { name: /^Run query \(Ctrl\/Cmd\+Enter\)$/ }).click();

  await expect(page.getByRole("heading", { name: /Pipeline stages/i })).toBeVisible({ timeout: 20_000 });
  const stageItems = page.locator("ul").filter({ hasText: /candidate\(s\)|rewritten|ms\)/ }).locator("li");
  await expect(async () => {
    expect(await stageItems.count()).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 20_000 });

  await expect(page.getByRole("heading", { name: /Citations \(link back to exact retrieved chunks\)/i })).toBeVisible({
    timeout: 20_000,
  });
  const citationItems = page.locator("ul li").filter({ hasText: `doc=` });
  await expect(async () => {
    expect(await citationItems.count()).toBeGreaterThan(0);
  }).toPass({ timeout: 20_000 });
});
