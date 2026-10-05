import { randomUUID } from "node:crypto";
import type { AuditLogEntry } from "@ail/shared";
import { getDb } from "../../db/index.js";

interface AuditLogRow {
  id: string;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: string;
  request_id: string | null;
  created_at: string;
}

function rowToEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id ?? undefined,
    details: JSON.parse(row.details),
    requestId: row.request_id ?? undefined,
    createdAt: row.created_at,
  };
}

export async function writeAuditLog(entry: Omit<AuditLogEntry, "id" | "createdAt">): Promise<AuditLogEntry> {
  const db = await getDb();
  const full: AuditLogEntry = {
    ...entry,
    id: `audit_${randomUUID()}`,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO audit_log (id, actor, action, resource_type, resource_id, details, request_id, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    full.id,
    full.actor,
    full.action,
    full.resourceType,
    full.resourceId ?? null,
    JSON.stringify(full.details),
    full.requestId ?? null,
    full.createdAt,
  );
  return full;
}

export interface ListAuditLogFilter {
  resourceType?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ListAuditLogResult {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function listAuditLog(filter: ListAuditLogFilter): Promise<ListAuditLogResult> {
  const db = await getDb();
  const page = filter.page ?? 0;
  const pageSize = Math.min(filter.pageSize ?? 20, 100);

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.resourceType) {
    clauses.push("resource_type = ?");
    params.push(filter.resourceType);
  }
  if (filter.from) {
    clauses.push("created_at >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    clauses.push("created_at <= ?");
    params.push(filter.to);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM audit_log ${where}`).get(...params) as { count: number }
  ).count;
  const rows = db
    .prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, page * pageSize) as AuditLogRow[];

  return { items: rows.map(rowToEntry), total, page, pageSize, hasMore: (page + 1) * pageSize < total };
}
