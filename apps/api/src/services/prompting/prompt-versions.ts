/**
 * M2 prompt versioning CRUD (`/prompting/prompt-versions*` - contracts.md
 * §4 M2). Persists to the `prompt_versions` table (already in
 * `db/schema.sql`). Versioning is append-only: `PUT` creates a NEW row with
 * `parentVersionId` set to the edited id and `version = parent.version + 1`
 * rather than mutating history, per contracts.md's note on why this matters
 * for diffing/eval-gating.
 */
import { randomUUID } from "node:crypto";
import type { PromptVersion } from "@ail/shared";
import { getDb } from "../../db/index.js";
import { conflictError, notFoundError } from "../../middleware/errors.js";

interface PromptVersionRow {
  id: string;
  name: string;
  version: number;
  template: string;
  variables: string;
  system: string | null;
  notes: string | null;
  created_at: string;
  parent_version_id: string | null;
  tags: string;
}

function rowToPromptVersion(row: PromptVersionRow): PromptVersion {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    template: row.template,
    variables: JSON.parse(row.variables),
    system: row.system ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    parentVersionId: row.parent_version_id ?? undefined,
    tags: JSON.parse(row.tags),
  };
}

export interface CreatePromptVersionArgs {
  name: string;
  template: string;
  variables: string[];
  system?: string;
  notes?: string;
  tags?: string[];
  version?: number;
  parentVersionId?: string;
}

export async function createPromptVersion(args: CreatePromptVersionArgs): Promise<PromptVersion> {
  const db = await getDb();
  const pv: PromptVersion = {
    id: `pv_${randomUUID()}`,
    name: args.name,
    version: args.version ?? 1,
    template: args.template,
    variables: args.variables,
    system: args.system,
    notes: args.notes,
    createdAt: new Date().toISOString(),
    parentVersionId: args.parentVersionId,
    tags: args.tags ?? [],
  };
  db.prepare(
    `INSERT INTO prompt_versions (id, name, version, template, variables, system, notes, created_at, parent_version_id, tags)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    pv.id,
    pv.name,
    pv.version,
    pv.template,
    JSON.stringify(pv.variables),
    pv.system ?? null,
    pv.notes ?? null,
    pv.createdAt,
    pv.parentVersionId ?? null,
    JSON.stringify(pv.tags),
  );
  return pv;
}

export async function getPromptVersion(id: string): Promise<PromptVersion | undefined> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM prompt_versions WHERE id = ?`).get(id) as PromptVersionRow | undefined;
  return row ? rowToPromptVersion(row) : undefined;
}

export interface ListPromptVersionsFilter {
  name?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}

export interface ListPromptVersionsResult {
  items: PromptVersion[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function listPromptVersions(filter: ListPromptVersionsFilter): Promise<ListPromptVersionsResult> {
  const db = await getDb();
  const page = filter.page ?? 0;
  const pageSize = Math.min(filter.pageSize ?? 20, 100);

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.name) {
    clauses.push("name = ?");
    params.push(filter.name);
  }
  if (filter.tag) {
    clauses.push("tags LIKE ?");
    params.push(`%"${filter.tag}"%`);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM prompt_versions ${where}`).get(...params) as { count: number }
  ).count;
  const rows = db
    .prepare(`SELECT * FROM prompt_versions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, page * pageSize) as PromptVersionRow[];

  return {
    items: rows.map(rowToPromptVersion),
    total,
    page,
    pageSize,
    hasMore: (page + 1) * pageSize < total,
  };
}

export interface UpdatePromptVersionArgs {
  template?: string;
  variables?: string[];
  system?: string;
  notes?: string;
  tags?: string[];
  name?: string;
}

/** `PUT /prompting/prompt-versions/:id`: creates a NEW version row rather than mutating `id`'s row. */
export async function updatePromptVersion(id: string, patch: UpdatePromptVersionArgs): Promise<PromptVersion> {
  const parent = await getPromptVersion(id);
  if (!parent) throw notFoundError(`PromptVersion ${id} not found`);
  return createPromptVersion({
    name: patch.name ?? parent.name,
    template: patch.template ?? parent.template,
    variables: patch.variables ?? parent.variables,
    system: patch.system ?? parent.system,
    notes: patch.notes ?? parent.notes,
    tags: patch.tags ?? parent.tags,
    version: parent.version + 1,
    parentVersionId: parent.id,
  });
}

/** `DELETE /prompting/prompt-versions/:id`: 409 if referenced by a stored eval suite result's variants. */
export async function deletePromptVersion(id: string): Promise<boolean> {
  const db = await getDb();
  const referencing = db
    .prepare(`SELECT COUNT(*) as count FROM eval_suite_results WHERE variants LIKE ?`)
    .get(`%"${id}"%`) as { count: number };
  if (referencing.count > 0) {
    throw conflictError(`PromptVersion ${id} is referenced by a stored eval suite result`, { promptVersionId: id });
  }
  const result = db.prepare(`DELETE FROM prompt_versions WHERE id = ?`).run(id);
  return result.changes > 0;
}
