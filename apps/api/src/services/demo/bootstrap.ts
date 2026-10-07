import { readFile, readdir } from "node:fs/promises";
import { DatasetSchema, PromptVersionSchema } from "@ail/shared";
import { getDb } from "../../db/index.js";
import { getDocument, getChunks, insertDocument } from "../../stores/rag/documents.js";
import { chunkDocument, embedDocumentChunks, indexDocument } from "../rag/ingest.js";
import { insertDataset } from "../evals/store.js";
import { createPromptVersion, listPromptVersions } from "../prompting/prompt-versions.js";

const fixtures = new URL("../../../../../seed/", import.meta.url);

/** Restore the mock lab's fixtures and memory index without replacing user data. */
export async function seedDemoData(): Promise<void> {
  const filenames = (await readdir(new URL("docs/", fixtures))).filter(name => /\.(md|txt)$/.test(name)).sort();
  for (const filename of filenames) {
    const id = `demo-doc:${filename}`;
    let document = await getDocument(id);
    if (!document) {
      const text = await readFile(new URL(`docs/${filename}`, fixtures), "utf8");
      document = await insertDocument({ id, name: filename, mimeType: "text/markdown", text, sizeBytes: Buffer.byteLength(text), metadata: { demoSeed: true } });
    }
    let chunks = await getChunks(id);
    if (!chunks.length) chunks = await chunkDocument(id, { strategy: "recursive", chunkSize: 500, chunkOverlap: 60 });
    if (chunks.some(chunk => !chunk.embedding)) await embedDocumentChunks(id, "mock", "mock-small");
    await indexDocument(id, "nimbus-kb");
  }

  const db = await getDb();
  const dataset = DatasetSchema.omit({ id: true }).parse(JSON.parse(await readFile(new URL("evals/nimbus-support-qa.dataset.json", fixtures), "utf8")));
  if (!db.prepare("SELECT id FROM datasets WHERE name = ? LIMIT 1").get(dataset.name)) await insertDataset(dataset);
  for (const filename of (await readdir(new URL("prompts/", fixtures))).filter(name => name.endsWith(".json")).sort()) {
    const prompt = PromptVersionSchema.omit({ id: true, version: true, createdAt: true, parentVersionId: true }).parse(JSON.parse(await readFile(new URL(`prompts/${filename}`, fixtures), "utf8")));
    if (!(await listPromptVersions({ name: prompt.name, pageSize: 1 })).items.length) await createPromptVersion(prompt);
  }
}
