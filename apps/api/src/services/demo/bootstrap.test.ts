import { afterAll, beforeAll, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-demo-bootstrap.db");
process.env.VECTOR_STORE = "memory";
const { seedDemoData } = await import("./bootstrap.js");
const { getDb, closeDb } = await import("../../db/index.js");
const { getVectorStore, _resetVectorStoreForTests } = await import("../../stores/vector/registry.js");
const { insertDocument, getDocument } = await import("../../stores/rag/documents.js");

beforeAll(async () => { await seedDemoData(); });
afterAll(() => { closeDb(); _resetVectorStoreForTests(); });

it("provides indexed documents, a populated dataset, and saved prompts", async () => {
  const db = await getDb();
  expect(db.prepare("SELECT COUNT(*) AS count FROM documents").get()).toEqual({ count: 5 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM eval_cases").get()).toEqual({ count: 18 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM prompt_versions").get()).toEqual({ count: 2 });
  expect(await (await getVectorStore()).count("nimbus-kb")).toBeGreaterThan(0);
});

it("does not duplicate fixtures or change user documents and restores the memory index after restart", async () => {
  await insertDocument({ id: "user-document", name: "My notes", mimeType: "text/plain", text: "Keep my work", sizeBytes: 12, metadata: {} });
  _resetVectorStoreForTests();
  await seedDemoData();
  const db = await getDb();
  expect(db.prepare("SELECT COUNT(*) AS count FROM documents").get()).toEqual({ count: 6 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM datasets").get()).toEqual({ count: 1 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM prompt_versions").get()).toEqual({ count: 2 });
  expect((await getDocument("user-document"))?.text).toBe("Keep my work");
  expect(await (await getVectorStore()).count("nimbus-kb")).toBeGreaterThan(0);
});
