import { randomUUID } from "node:crypto";
import type { Run, RunStatus, ModuleId, ProviderId } from "@ail/shared";
import { getDb } from "../../db/index.js";

/** Raw `runs` table row shape (snake_case, JSON columns as TEXT). */
interface RunRow {
  id: string;
  module_id: string;
  feature: string;
  provider_id: string;
  model: string;
  params: string;
  input: string;
  output: string;
  usage: string;
  cost: string;
  latency_ms: number;
  ttft_ms: number | null;
  tokens_per_second: number | null;
  logprobs: string | null;
  status: string;
  error: string | null;
  seed: number | null;
  created_at: string;
  completed_at: string | null;
  parent_run_id: string | null;
  trace_id: string | null;
  tags: string;
  metadata: string;
}

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    moduleId: row.module_id as ModuleId,
    feature: row.feature,
    providerId: row.provider_id as ProviderId,
    model: row.model,
    params: JSON.parse(row.params),
    input: JSON.parse(row.input),
    output: JSON.parse(row.output),
    usage: JSON.parse(row.usage),
    cost: JSON.parse(row.cost),
    latencyMs: row.latency_ms,
    ttftMs: row.ttft_ms ?? undefined,
    tokensPerSecond: row.tokens_per_second ?? undefined,
    logprobs: row.logprobs ? JSON.parse(row.logprobs) : undefined,
    status: row.status as RunStatus,
    error: row.error ?? undefined,
    seed: row.seed ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    parentRunId: row.parent_run_id ?? undefined,
    traceId: row.trace_id ?? undefined,
    tags: JSON.parse(row.tags),
    metadata: JSON.parse(row.metadata),
  };
}

export type NewRun = Omit<Run, "id" | "createdAt"> & { id?: string; createdAt?: string };

/** Inserts a new run row. Call this BEFORE emitting `run_start`/`run_complete` so `run.id === runId` always holds. */
export async function insertRun(run: NewRun): Promise<Run> {
  const db = await getDb();
  const full: Run = {
    ...run,
    id: run.id ?? `run_${randomUUID()}`,
    createdAt: run.createdAt ?? new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO runs (
      id, module_id, feature, provider_id, model, params, input, output, usage, cost,
      latency_ms, ttft_ms, tokens_per_second, logprobs, status, error, seed,
      created_at, completed_at, parent_run_id, trace_id, tags, metadata
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    full.id,
    full.moduleId,
    full.feature,
    full.providerId,
    full.model,
    JSON.stringify(full.params),
    JSON.stringify(full.input),
    JSON.stringify(full.output),
    JSON.stringify(full.usage),
    JSON.stringify(full.cost),
    full.latencyMs,
    full.ttftMs ?? null,
    full.tokensPerSecond ?? null,
    full.logprobs ? JSON.stringify(full.logprobs) : null,
    full.status,
    full.error ?? null,
    full.seed ?? null,
    full.createdAt,
    full.completedAt ?? null,
    full.parentRunId ?? null,
    full.traceId ?? null,
    JSON.stringify(full.tags),
    JSON.stringify(full.metadata),
  );
  return full;
}

/** Patches an existing run row (e.g. pending -> complete/error) and returns the merged `Run`. */
export async function updateRun(id: string, patch: Partial<Run>): Promise<Run> {
  const existing = await getRun(id);
  if (!existing) throw new Error(`updateRun: run ${id} not found`);
  const merged: Run = { ...existing, ...patch, id: existing.id };
  const db = await getDb();
  db.prepare(
    `UPDATE runs SET
      module_id=?, feature=?, provider_id=?, model=?, params=?, input=?, output=?, usage=?, cost=?,
      latency_ms=?, ttft_ms=?, tokens_per_second=?, logprobs=?, status=?, error=?, seed=?,
      completed_at=?, parent_run_id=?, trace_id=?, tags=?, metadata=?
    WHERE id=?`,
  ).run(
    merged.moduleId,
    merged.feature,
    merged.providerId,
    merged.model,
    JSON.stringify(merged.params),
    JSON.stringify(merged.input),
    JSON.stringify(merged.output),
    JSON.stringify(merged.usage),
    JSON.stringify(merged.cost),
    merged.latencyMs,
    merged.ttftMs ?? null,
    merged.tokensPerSecond ?? null,
    merged.logprobs ? JSON.stringify(merged.logprobs) : null,
    merged.status,
    merged.error ?? null,
    merged.seed ?? null,
    merged.completedAt ?? null,
    merged.parentRunId ?? null,
    merged.traceId ?? null,
    JSON.stringify(merged.tags),
    JSON.stringify(merged.metadata),
    merged.id,
  );
  return merged;
}

export async function getRun(id: string): Promise<Run | undefined> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as RunRow | undefined;
  return row ? rowToRun(row) : undefined;
}

export async function deleteRun(id: string): Promise<boolean> {
  const db = await getDb();
  const result = db.prepare(`DELETE FROM runs WHERE id = ?`).run(id);
  return result.changes > 0;
}

export interface ListRunsFilter {
  moduleId?: string;
  feature?: string;
  providerId?: string;
  model?: string;
  traceId?: string;
  tags?: string[];
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ListRunsResult {
  items: Run[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function listRuns(filter: ListRunsFilter): Promise<ListRunsResult> {
  const db = await getDb();
  const page = filter.page ?? 0;
  const pageSize = Math.min(filter.pageSize ?? 20, 100);

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.moduleId) {
    clauses.push("module_id = ?");
    params.push(filter.moduleId);
  }
  if (filter.feature) {
    clauses.push("feature = ?");
    params.push(filter.feature);
  }
  if (filter.providerId) {
    clauses.push("provider_id = ?");
    params.push(filter.providerId);
  }
  if (filter.model) {
    clauses.push("model = ?");
    params.push(filter.model);
  }
  if (filter.traceId) {
    clauses.push("trace_id = ?");
    params.push(filter.traceId);
  }
  if (filter.from) {
    clauses.push("created_at >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    clauses.push("created_at <= ?");
    params.push(filter.to);
  }
  if (filter.tags && filter.tags.length > 0) {
    clauses.push(`(${filter.tags.map(() => "tags LIKE ?").join(" OR ")})`);
    for (const t of filter.tags) params.push(`%"${t}"%`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM runs ${where}`).get(...params) as { count: number }
  ).count;
  const rows = db
    .prepare(`SELECT * FROM runs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, page * pageSize) as RunRow[];

  return {
    items: rows.map(rowToRun),
    total,
    page,
    pageSize,
    hasMore: (page + 1) * pageSize < total,
  };
}
