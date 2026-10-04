import { randomUUID } from "node:crypto";
import type { CostBreakdown, Span, SpanEvent, SpanKind, SpanStatus, TokenUsage, Trace } from "@ail/shared";
import { getDb } from "../../db/index.js";

interface SpanRow {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  attributes: string;
  events: string;
  status: string;
}

function rowToSpan(row: SpanRow): Span {
  return {
    traceId: row.trace_id,
    spanId: row.span_id,
    parentSpanId: row.parent_span_id ?? undefined,
    name: row.name,
    kind: row.kind as SpanKind,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    attributes: JSON.parse(row.attributes),
    events: JSON.parse(row.events),
    status: row.status as SpanStatus,
  };
}

async function insertSpan(span: Span): Promise<void> {
  const db = await getDb();
  db.prepare(
    `INSERT INTO spans (span_id, trace_id, parent_span_id, name, kind, started_at, ended_at, duration_ms, attributes, events, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    span.spanId,
    span.traceId,
    span.parentSpanId ?? null,
    span.name,
    span.kind,
    span.startedAt,
    span.endedAt ?? null,
    span.durationMs ?? null,
    JSON.stringify(span.attributes),
    JSON.stringify(span.events),
    span.status,
  );
}

async function ensureTraceRow(traceId: string, rootSpanId: string): Promise<void> {
  const db = await getDb();
  const existing = db.prepare(`SELECT 1 FROM traces WHERE id = ?`).get(traceId);
  if (!existing) {
    db.prepare(`INSERT INTO traces (id, root_span_id, totals) VALUES (?,?,?)`).run(
      traceId,
      rootSpanId,
      JSON.stringify({ usage: zeroUsage(), cost: zeroCost(), durationMs: 0 }),
    );
  }
}

function zeroUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}
function zeroCost(): CostBreakdown {
  return { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, currency: "USD" };
}

/**
 * Wraps `fn` in an OTel-shaped span: starts a span (creating a new trace if
 * `traceId` is omitted), runs `fn`, records success/error + duration, and
 * persists the span row. Every Wave-2 module that does multi-stage work
 * (RAG retrieval stages, agent steps, eval case runs, guardrail layers)
 * should wrap each stage in `withSpan` so `GET /traces/:id` shows a real
 * tree instead of each module inventing its own tracing.
 */
export async function withSpan<T>(
  name: string,
  kind: SpanKind,
  attributes: Record<string, unknown>,
  fn: (ctx: { traceId: string; spanId: string }) => Promise<T>,
  opts: { traceId?: string; parentSpanId?: string } = {},
): Promise<T> {
  const traceId = opts.traceId ?? `trace_${randomUUID()}`;
  const spanId = `span_${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const events: SpanEvent[] = [];

  await ensureTraceRow(traceId, spanId);

  try {
    const result = await fn({ traceId, spanId });
    const endedAt = new Date().toISOString();
    await insertSpan({
      traceId,
      spanId,
      parentSpanId: opts.parentSpanId,
      name,
      kind,
      startedAt,
      endedAt,
      durationMs: Date.parse(endedAt) - Date.parse(startedAt),
      attributes,
      events,
      status: "ok",
    });
    return result;
  } catch (err) {
    const endedAt = new Date().toISOString();
    events.push({
      name: "exception",
      timestamp: endedAt,
      attributes: { message: err instanceof Error ? err.message : String(err) },
    });
    await insertSpan({
      traceId,
      spanId,
      parentSpanId: opts.parentSpanId,
      name,
      kind,
      startedAt,
      endedAt,
      durationMs: Date.parse(endedAt) - Date.parse(startedAt),
      attributes,
      events,
      status: "error",
    });
    throw err;
  }
}

/** Aggregates a trace's spans + any `runs` tagged with that `traceId` into the full `Trace` shape. */
export async function getTrace(traceId: string): Promise<Trace | undefined> {
  const db = await getDb();
  const traceRow = db.prepare(`SELECT * FROM traces WHERE id = ?`).get(traceId) as
    | { id: string; root_span_id: string }
    | undefined;
  if (!traceRow) return undefined;

  const spanRows = db
    .prepare(`SELECT * FROM spans WHERE trace_id = ? ORDER BY started_at ASC`)
    .all(traceId) as SpanRow[];
  const spans = spanRows.map(rowToSpan);

  const runRows = db
    .prepare(`SELECT usage, cost FROM runs WHERE trace_id = ?`)
    .all(traceId) as { usage: string; cost: string }[];

  const usage = runRows.reduce<TokenUsage>((acc, r) => {
    const u = JSON.parse(r.usage) as TokenUsage;
    return {
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
      totalTokens: acc.totalTokens + u.totalTokens,
    };
  }, zeroUsage());

  const cost = runRows.reduce<CostBreakdown>((acc, r) => {
    const c = JSON.parse(r.cost) as CostBreakdown;
    return {
      inputCostUsd: acc.inputCostUsd + c.inputCostUsd,
      outputCostUsd: acc.outputCostUsd + c.outputCostUsd,
      totalCostUsd: acc.totalCostUsd + c.totalCostUsd,
      currency: "USD",
    };
  }, zeroCost());

  const durationMs = spans.reduce((max, s) => Math.max(max, s.durationMs ?? 0), 0);

  return {
    id: traceRow.id,
    rootSpanId: traceRow.root_span_id,
    spans,
    totals: { usage, cost, durationMs },
  };
}

export interface ListTracesFilter {
  moduleId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ListTracesResult {
  items: Trace[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Lists traces, optionally filtered by the root span's `attributes.moduleId` (per contracts §3). */
export async function listTraces(filter: ListTracesFilter): Promise<ListTracesResult> {
  const db = await getDb();
  const page = filter.page ?? 0;
  const pageSize = Math.min(filter.pageSize ?? 20, 100);

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.from) {
    clauses.push("t.created_at >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    clauses.push("t.created_at <= ?");
    params.push(filter.to);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const idRows = db
    .prepare(`SELECT t.id FROM traces t ${where} ORDER BY t.created_at DESC`)
    .all(...params) as { id: string }[];

  let ids = idRows.map((r) => r.id);
  const traces = (await Promise.all(ids.map((id) => getTrace(id)))).filter(
    (t): t is Trace => t !== undefined,
  );

  const filtered = filter.moduleId
    ? traces.filter((t) => {
        const root = t.spans.find((s) => s.spanId === t.rootSpanId);
        return root?.attributes.moduleId === filter.moduleId;
      })
    : traces;

  const total = filtered.length;
  const items = filtered.slice(page * pageSize, page * pageSize + pageSize);

  return { items, total, page, pageSize, hasMore: (page + 1) * pageSize < total };
}
