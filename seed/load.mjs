#!/usr/bin/env node
/**
 * Seed loader for AI Engineer Lab.
 *
 * Zero dependencies (plain Node ESM, uses the built-in `fetch`). Loads every
 * fixture in this `seed/` folder into a RUNNING instance of the app via its
 * normal public HTTP API (docs/contracts.md) - it does not touch the SQLite
 * file directly, so it works identically whether the API is running via
 * `pnpm dev`, `node apps/api/dist/server.js`, or inside `docker compose`.
 *
 * Usage (from the repo root, with the API already running):
 *   node seed/load.mjs
 *   API_BASE=http://localhost:8080 node seed/load.mjs   # if you remapped ports
 *
 * See seed/README.md for what gets loaded and why.
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const API_BASE = (process.env.API_BASE ?? "http://localhost:8787").replace(/\/+$/, "");
const RAG_COLLECTION = "nimbus-kb";
const EMBED_PROVIDER = { providerId: "mock", model: "mock-small" }; // zero-key by default; override by editing this file if you want a real embedding model.

async function api(method, path, body) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const message = typeof parsed === "object" && parsed && "message" in parsed ? parsed.message : text;
    throw new Error(`${method} ${path} -> ${res.status}: ${message}`);
  }
  return parsed;
}

async function loadDocuments() {
  const dir = join(here, "docs");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md") || f.endsWith(".txt"));
  files.sort();
  console.log(`\n[docs] ingesting ${files.length} documents into RAG collection "${RAG_COLLECTION}"...`);

  const results = [];
  for (const file of files) {
    const text = await readFile(join(dir, file), "utf-8");
    const doc = await api("POST", "/rag/documents", {
      name: file,
      mimeType: "text/markdown",
      text,
    });
    await api("POST", `/rag/documents/${doc.id}/chunk`, {
      config: { strategy: "recursive", chunkSize: 500, chunkOverlap: 60 },
    });
    await api("POST", `/rag/documents/${doc.id}/embed`, { ...EMBED_PROVIDER });
    const indexed = await api("POST", `/rag/documents/${doc.id}/index`, { collection: RAG_COLLECTION });
    console.log(`  - ${file} -> document ${doc.id}, ${indexed.count} chunks indexed`);
    results.push({ file, documentId: doc.id });
  }
  return results;
}

async function loadEvalDataset() {
  console.log(`\n[evals] creating the JSON-sourced dataset...`);
  const body = JSON.parse(await readFile(join(here, "evals", "nimbus-support-qa.dataset.json"), "utf-8"));
  const dataset = await api("POST", "/evals/datasets", body);
  console.log(`  - "${dataset.name}" -> dataset ${dataset.id} (${dataset.cases.length} cases)`);

  console.log(`[evals] creating a second, empty dataset and importing the CSV twin into it (exercises the CSV importer end to end)...`);
  const csvContent = await readFile(join(here, "evals", "nimbus-support-qa.cases.csv"), "utf-8");
  const csvDataset = await api("POST", "/evals/datasets", {
    name: "Nimbus Support QA (CSV import demo)",
    description: "Same 18 cases as 'Nimbus Support QA', loaded via POST /evals/datasets/:id/import with format=csv instead of inline JSON - use this one to see the CSV importer work.",
    cases: [],
  });
  const imported = await api("POST", `/evals/datasets/${csvDataset.id}/import`, {
    format: "csv",
    content: csvContent,
  });
  console.log(`  - "${csvDataset.name}" -> dataset ${csvDataset.id} (${imported.imported} cases imported from CSV)`);

  return { jsonDatasetId: dataset.id, csvDatasetId: csvDataset.id };
}

async function loadPromptVersions() {
  console.log(`\n[prompting] creating the two seed prompt versions...`);
  const dir = join(here, "prompts");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  files.sort();
  const results = [];
  for (const file of files) {
    const body = JSON.parse(await readFile(join(dir, file), "utf-8"));
    const pv = await api("POST", "/prompting/prompt-versions", body);
    console.log(`  - "${pv.name}" -> prompt version ${pv.id}`);
    results.push({ file, id: pv.id, name: pv.name });
  }
  return results;
}

async function main() {
  console.log(`Seeding AI Engineer Lab at ${API_BASE} ...`);
  try {
    await api("GET", "/health");
  } catch (err) {
    console.error(
      `\nCould not reach ${API_BASE}/api/health. Is the API running?\n` +
        `  - Local:  pnpm dev   (api on http://localhost:8787 by default)\n` +
        `  - Docker: docker compose up -d   (api on http://localhost:8787 by default)\n` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
    return;
  }

  const docs = await loadDocuments();
  const evals = await loadEvalDataset();
  const prompts = await loadPromptVersions();

  console.log(`\nDone. Summary:`);
  console.log(`  RAG collection:   "${RAG_COLLECTION}" (${docs.length} documents)`);
  console.log(`  Eval datasets:    ${evals.jsonDatasetId}, ${evals.csvDatasetId}`);
  console.log(`  Prompt versions:  ${prompts.map((p) => p.id).join(", ")}`);
  console.log(
    `\nTry it: open the RAG module and query collection "${RAG_COLLECTION}" (e.g. "How much does the Pro plan` +
      ` cost?"), or open Evals and run dataset "Nimbus Support QA" across both seed prompt versions.`,
  );
}

main().catch((err) => {
  console.error("\nSeeding failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
