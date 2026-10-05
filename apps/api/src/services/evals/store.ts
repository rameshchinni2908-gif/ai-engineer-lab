import { randomUUID } from "node:crypto";
import type { Dataset, EvalCase, EvalResult, EvalSuiteResult, EvalVariant, MetricId } from "@ail/shared";
import { getDb } from "../../db/index.js";
import { notFoundError, conflictError } from "../../middleware/errors.js";

// ---------------------------------------------------------------------------
// datasets + eval_cases
// ---------------------------------------------------------------------------

interface DatasetRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}
interface EvalCaseRow {
  id: string;
  dataset_id: string;
  input: string;
  expected: string | null;
  tags: string;
  metadata: string;
}

// `eval_cases.id` is a single global PRIMARY KEY (one shared table across
// every dataset), but `EvalCase.id` only needs to be unique WITHIN its own
// dataset (e.g. two different datasets both using "c1"). We bridge this by
// storing the physical row id as `${datasetId}::${logicalId}` and stripping
// the prefix back off on read, so the public `EvalCase.id` a caller chose
// (or that we auto-generated) never collides across unrelated datasets.
function physicalCaseId(datasetId: string, logicalId: string): string {
  return `${datasetId}::${logicalId}`;
}

function caseRowToCase(row: EvalCaseRow): EvalCase {
  const prefix = `${row.dataset_id}::`;
  const logicalId = row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id;
  return {
    id: logicalId,
    input: JSON.parse(row.input),
    expected: row.expected !== null ? JSON.parse(row.expected) : undefined,
    tags: JSON.parse(row.tags),
    metadata: JSON.parse(row.metadata),
  };
}

async function loadCases(datasetId: string): Promise<EvalCase[]> {
  const db = await getDb();
  const rows = db
    .prepare(`SELECT * FROM eval_cases WHERE dataset_id = ?`)
    .all(datasetId) as EvalCaseRow[];
  return rows.map(caseRowToCase);
}

async function replaceCases(datasetId: string, cases: EvalCase[]): Promise<void> {
  const db = await getDb();
  db.prepare(`DELETE FROM eval_cases WHERE dataset_id = ?`).run(datasetId);
  const stmt = db.prepare(
    `INSERT INTO eval_cases (id, dataset_id, input, expected, tags, metadata) VALUES (?,?,?,?,?,?)`,
  );
  for (const c of cases) {
    stmt.run(
      physicalCaseId(datasetId, c.id),
      datasetId,
      JSON.stringify(c.input),
      c.expected !== undefined ? JSON.stringify(c.expected) : null,
      JSON.stringify(c.tags ?? []),
      JSON.stringify(c.metadata ?? {}),
    );
  }
}

export interface NewDatasetArgs {
  name: string;
  description?: string;
  cases: EvalCase[];
}

export async function insertDataset(args: NewDatasetArgs): Promise<Dataset> {
  const db = await getDb();
  const id = `dataset_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  db.prepare(`INSERT INTO datasets (id, name, description, created_at) VALUES (?,?,?,?)`).run(
    id,
    args.name,
    args.description ?? null,
    createdAt,
  );
  const casesWithIds = args.cases.map((c) => ({ ...c, id: c.id || `case_${randomUUID()}` }));
  await replaceCases(id, casesWithIds);
  return { id, name: args.name, description: args.description, cases: casesWithIds };
}

export async function getDataset(id: string): Promise<Dataset | undefined> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM datasets WHERE id = ?`).get(id) as DatasetRow | undefined;
  if (!row) return undefined;
  const cases = await loadCases(id);
  return { id: row.id, name: row.name, description: row.description ?? undefined, cases };
}

export async function requireDataset(id: string): Promise<Dataset> {
  const dataset = await getDataset(id);
  if (!dataset) throw notFoundError(`Dataset ${id} not found`);
  return dataset;
}

export interface ListDatasetsResult {
  items: Dataset[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function listDatasets(opts: { page?: number; pageSize?: number }): Promise<ListDatasetsResult> {
  const db = await getDb();
  const page = opts.page ?? 0;
  const pageSize = Math.min(opts.pageSize ?? 20, 100);
  const total = (db.prepare(`SELECT COUNT(*) as count FROM datasets`).get() as { count: number }).count;
  const rows = db
    .prepare(`SELECT * FROM datasets ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(pageSize, page * pageSize) as DatasetRow[];
  const items = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      cases: await loadCases(row.id),
    })),
  );
  return { items, total, page, pageSize, hasMore: (page + 1) * pageSize < total };
}

export async function updateDataset(
  id: string,
  patch: Partial<Omit<Dataset, "id">>,
): Promise<Dataset> {
  const existing = await requireDataset(id);
  const merged: Dataset = { ...existing, ...patch, id };
  const db = await getDb();
  db.prepare(`UPDATE datasets SET name=?, description=? WHERE id=?`).run(
    merged.name,
    merged.description ?? null,
    id,
  );
  if (patch.cases) {
    const casesWithIds = patch.cases.map((c) => ({ ...c, id: c.id || `case_${randomUUID()}` }));
    await replaceCases(id, casesWithIds);
    merged.cases = casesWithIds;
  }
  return merged;
}

export async function deleteDataset(id: string): Promise<boolean> {
  const db = await getDb();
  const referencedBy = db
    .prepare(`SELECT COUNT(*) as count FROM eval_suite_results WHERE dataset_id = ?`)
    .get(id) as { count: number };
  if (referencedBy.count > 0) {
    throw conflictError(`Dataset ${id} is referenced by a stored EvalSuiteResult`);
  }
  db.prepare(`DELETE FROM eval_cases WHERE dataset_id = ?`).run(id);
  const result = db.prepare(`DELETE FROM datasets WHERE id = ?`).run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// eval_results
// ---------------------------------------------------------------------------

interface EvalResultRow {
  id: string;
  dataset_id: string;
  case_id: string;
  run_id: string;
  metric_id: string;
  score: number;
  passed: number;
  rationale: string | null;
  judge_run_id: string | null;
  created_at: string;
}

function resultRowToResult(row: EvalResultRow): EvalResult {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    caseId: row.case_id,
    runId: row.run_id,
    metricId: row.metric_id as MetricId,
    score: row.score,
    passed: row.passed === 1,
    rationale: row.rationale ?? undefined,
    judgeRunId: row.judge_run_id ?? undefined,
    createdAt: row.created_at,
  };
}

export async function insertEvalResult(result: Omit<EvalResult, "id" | "createdAt">): Promise<EvalResult> {
  const db = await getDb();
  const full: EvalResult = {
    ...result,
    id: `evalresult_${randomUUID()}`,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO eval_results (id, dataset_id, case_id, run_id, metric_id, score, passed, rationale, judge_run_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    full.id,
    full.datasetId,
    full.caseId,
    full.runId,
    full.metricId,
    full.score,
    full.passed ? 1 : 0,
    full.rationale ?? null,
    full.judgeRunId ?? null,
    full.createdAt,
  );
  return full;
}

export async function listEvalResultsForDataset(datasetId: string): Promise<EvalResult[]> {
  const db = await getDb();
  const rows = db
    .prepare(`SELECT * FROM eval_results WHERE dataset_id = ? ORDER BY created_at ASC`)
    .all(datasetId) as EvalResultRow[];
  return rows.map(resultRowToResult);
}

// ---------------------------------------------------------------------------
// eval_suite_results
// ---------------------------------------------------------------------------

interface EvalSuiteResultRow {
  id: string;
  dataset_id: string;
  variants: string;
  aggregates: string;
  regressions: string;
  total_cost: number;
  total_latency_ms: number;
  created_at: string;
}

function suiteRowToSuite(row: EvalSuiteResultRow, rows: EvalResult[]): EvalSuiteResult {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    variants: JSON.parse(row.variants) as EvalVariant[],
    rows,
    aggregates: JSON.parse(row.aggregates),
    regressions: JSON.parse(row.regressions),
    totalCost: row.total_cost,
    totalLatencyMs: row.total_latency_ms,
    createdAt: row.created_at,
  };
}

export async function insertEvalSuiteResult(
  suite: Omit<EvalSuiteResult, "id" | "createdAt">,
): Promise<EvalSuiteResult> {
  const db = await getDb();
  const full: EvalSuiteResult = {
    ...suite,
    id: `suite_${randomUUID()}`,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO eval_suite_results (id, dataset_id, variants, aggregates, regressions, total_cost, total_latency_ms, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    full.id,
    full.datasetId,
    JSON.stringify(full.variants),
    JSON.stringify(full.aggregates),
    JSON.stringify(full.regressions),
    full.totalCost,
    full.totalLatencyMs,
    full.createdAt,
  );
  return full;
}

export async function getEvalSuiteResult(id: string): Promise<EvalSuiteResult | undefined> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM eval_suite_results WHERE id = ?`).get(id) as
    | EvalSuiteResultRow
    | undefined;
  if (!row) return undefined;
  const rows = db
    .prepare(`SELECT * FROM eval_results WHERE dataset_id = ? ORDER BY created_at ASC`)
    .all(row.dataset_id) as EvalResultRow[];
  return suiteRowToSuite(row, rows.map(resultRowToResult));
}

export async function requireEvalSuiteResult(id: string): Promise<EvalSuiteResult> {
  const suite = await getEvalSuiteResult(id);
  if (!suite) throw notFoundError(`EvalSuiteResult ${id} not found`);
  return suite;
}

export interface ListSuiteResultsResult {
  items: EvalSuiteResult[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function listEvalSuiteResults(opts: {
  datasetId?: string;
  page?: number;
  pageSize?: number;
}): Promise<ListSuiteResultsResult> {
  const db = await getDb();
  const page = opts.page ?? 0;
  const pageSize = Math.min(opts.pageSize ?? 20, 100);
  const where = opts.datasetId ? `WHERE dataset_id = ?` : "";
  const params = opts.datasetId ? [opts.datasetId] : [];
  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM eval_suite_results ${where}`).get(...params) as {
      count: number;
    }
  ).count;
  const rows = db
    .prepare(`SELECT * FROM eval_suite_results ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, page * pageSize) as EvalSuiteResultRow[];
  const items = rows.map((row) => suiteRowToSuite(row, []));
  return { items, total, page, pageSize, hasMore: (page + 1) * pageSize < total };
}

// ---------------------------------------------------------------------------
// prompt_versions (read-only access to a table owned by backend-core's db
// layer; `llm-modules` owns the write-side service for this table. We only
// ever SELECT by id here to render a prompt for an eval case - no write path.)
// ---------------------------------------------------------------------------

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

export interface PromptVersionLite {
  id: string;
  name: string;
  template: string;
  variables: string[];
  system?: string;
}

export async function getPromptVersionLite(id: string): Promise<PromptVersionLite | undefined> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM prompt_versions WHERE id = ?`).get(id) as
    | PromptVersionRow
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    template: row.template,
    variables: JSON.parse(row.variables),
    system: row.system ?? undefined,
  };
}
