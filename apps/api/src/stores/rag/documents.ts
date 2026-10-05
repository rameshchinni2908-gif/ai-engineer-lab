import type { Chunk, Document } from "@ail/shared";
import { getDb } from "../../db/index.js";

interface DocumentRow {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  text: string;
  metadata: string;
  created_at: string;
}

function rowToDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    text: row.text,
    metadata: JSON.parse(row.metadata),
    createdAt: row.created_at,
  };
}

export type NewDocument = Omit<Document, "createdAt">;

export async function insertDocument(doc: NewDocument): Promise<Document> {
  const db = await getDb();
  const full: Document = { ...doc, createdAt: new Date().toISOString() };
  db.prepare(
    `INSERT INTO documents (id, name, mime_type, size_bytes, text, metadata, created_at) VALUES (?,?,?,?,?,?,?)`,
  ).run(full.id, full.name, full.mimeType, full.sizeBytes, full.text, JSON.stringify(full.metadata), full.createdAt);
  return full;
}

export async function getDocument(id: string): Promise<Document | undefined> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id) as DocumentRow | undefined;
  return row ? rowToDocument(row) : undefined;
}

export interface ListDocumentsFilter {
  page?: number;
  pageSize?: number;
}

export async function listDocuments(
  filter: ListDocumentsFilter,
): Promise<{ items: Document[]; total: number; page: number; pageSize: number; hasMore: boolean }> {
  const db = await getDb();
  const page = filter.page ?? 0;
  const pageSize = Math.min(filter.pageSize ?? 20, 100);
  const total = (db.prepare(`SELECT COUNT(*) as count FROM documents`).get() as { count: number }).count;
  const rows = db
    .prepare(`SELECT * FROM documents ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(pageSize, page * pageSize) as DocumentRow[];
  return { items: rows.map(rowToDocument), total, page, pageSize, hasMore: (page + 1) * pageSize < total };
}

export async function updateDocumentMetadata(id: string, metadata: Record<string, unknown>): Promise<Document> {
  const db = await getDb();
  db.prepare(`UPDATE documents SET metadata = ? WHERE id = ?`).run(JSON.stringify(metadata), id);
  const updated = await getDocument(id);
  if (!updated) throw new Error(`updateDocumentMetadata: document ${id} not found`);
  return updated;
}

export async function deleteDocumentRow(id: string): Promise<boolean> {
  const db = await getDb();
  const result = db.prepare(`DELETE FROM documents WHERE id = ?`).run(id);
  return result.changes > 0;
}

interface ChunkRow {
  id: string;
  document_id: string;
  idx: number;
  text: string;
  start_offset: number;
  end_offset: number;
  token_count: number;
  embedding: string | null;
  metadata: string;
  parent_chunk_id: string | null;
}

function rowToChunk(row: ChunkRow): Chunk {
  return {
    id: row.id,
    documentId: row.document_id,
    index: row.idx,
    text: row.text,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    tokenCount: row.token_count,
    embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
    metadata: JSON.parse(row.metadata),
    parentChunkId: row.parent_chunk_id ?? undefined,
  };
}

/** Replaces ALL existing chunk rows for `documentId` with `chunks` (per contracts: re-chunking replaces prior chunking). */
export async function replaceChunks(documentId: string, chunks: Chunk[]): Promise<void> {
  const db = await getDb();
  db.prepare(`DELETE FROM chunks WHERE document_id = ?`).run(documentId);
  const stmt = db.prepare(
    `INSERT INTO chunks (id, document_id, idx, text, start_offset, end_offset, token_count, embedding, metadata, parent_chunk_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const c of chunks) {
    stmt.run(
      c.id,
      c.documentId,
      c.index,
      c.text,
      c.startOffset,
      c.endOffset,
      c.tokenCount,
      c.embedding ? JSON.stringify(c.embedding) : null,
      JSON.stringify(c.metadata),
      c.parentChunkId ?? null,
    );
  }
}

export async function getChunks(documentId: string): Promise<Chunk[]> {
  const db = await getDb();
  const rows = db
    .prepare(`SELECT * FROM chunks WHERE document_id = ? ORDER BY idx ASC`)
    .all(documentId) as ChunkRow[];
  return rows.map(rowToChunk);
}

export async function getChunksByIds(ids: string[]): Promise<Chunk[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT * FROM chunks WHERE id IN (${placeholders})`).all(...ids) as ChunkRow[];
  return rows.map(rowToChunk);
}

/** Updates the `embedding` column for each chunk (by id) - used by `/rag/documents/:id/embed`. */
export async function updateChunkEmbeddings(chunks: Chunk[]): Promise<void> {
  const db = await getDb();
  const stmt = db.prepare(`UPDATE chunks SET embedding = ? WHERE id = ?`);
  for (const c of chunks) {
    stmt.run(c.embedding ? JSON.stringify(c.embedding) : null, c.id);
  }
}

export async function deleteChunksForDocument(documentId: string): Promise<void> {
  const db = await getDb();
  db.prepare(`DELETE FROM chunks WHERE document_id = ?`).run(documentId);
}
