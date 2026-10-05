import type { AgentLimits, AgentRun, AgentStatus, AgentStep, AgentStopReason } from "@ail/shared";
import { getDb } from "../../db/index.js";

interface AgentRunRow {
  id: string;
  runtime: string;
  goal: string;
  status: string;
  stop_reason: string | null;
  limits: string;
  totals: string;
  trace_id: string | null;
  created_at: string;
}

interface AgentStepRow {
  id: string;
  agent_run_id: string;
  idx: number;
  type: string;
  content: string;
  tool_call: string | null;
  tool_result: string | null;
  usage: string | null;
  cost: string | null;
  duration_ms: number;
  started_at: string;
  memory_writes: string | null;
}

export interface NewAgentRun {
  id: string;
  runtime: AgentRun["runtime"];
  goal: string;
  status: AgentStatus;
  limits: AgentLimits;
  totals: AgentRun["totals"];
  traceId?: string;
  createdAt: string;
}

export async function insertAgentRun(run: NewAgentRun): Promise<void> {
  const db = await getDb();
  db.prepare(
    `INSERT INTO agent_runs (id, runtime, goal, status, stop_reason, limits, totals, trace_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    run.id,
    run.runtime,
    run.goal,
    run.status,
    null,
    JSON.stringify(run.limits),
    JSON.stringify(run.totals),
    run.traceId ?? null,
    run.createdAt,
  );
}

export interface AgentRunPatch {
  status?: AgentStatus;
  stopReason?: AgentStopReason;
  totals?: AgentRun["totals"];
}

export async function updateAgentRun(id: string, patch: AgentRunPatch): Promise<void> {
  const db = await getDb();
  const existing = db.prepare(`SELECT * FROM agent_runs WHERE id = ?`).get(id) as AgentRunRow | undefined;
  if (!existing) return;
  const status = patch.status ?? existing.status;
  const stopReason = patch.stopReason ?? existing.stop_reason ?? null;
  const totals = patch.totals ? JSON.stringify(patch.totals) : existing.totals;
  db.prepare(`UPDATE agent_runs SET status = ?, stop_reason = ?, totals = ? WHERE id = ?`).run(
    status,
    stopReason,
    totals,
    id,
  );
}

export async function insertAgentStep(agentRunId: string, step: AgentStep): Promise<void> {
  const db = await getDb();
  db.prepare(
    `INSERT INTO agent_steps (id, agent_run_id, idx, type, content, tool_call, tool_result, usage, cost, duration_ms, started_at, memory_writes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    `${agentRunId}_step_${step.index}`,
    agentRunId,
    step.index,
    step.type,
    step.content,
    step.toolCall ? JSON.stringify(step.toolCall) : null,
    step.toolResult ? JSON.stringify(step.toolResult) : null,
    step.usage ? JSON.stringify(step.usage) : null,
    step.cost ? JSON.stringify(step.cost) : null,
    step.durationMs,
    step.startedAt,
    step.memoryWrites ? JSON.stringify(step.memoryWrites) : null,
  );
}

function rowToStep(row: AgentStepRow): AgentStep {
  return {
    index: row.idx,
    type: row.type as AgentStep["type"],
    content: row.content,
    toolCall: row.tool_call ? JSON.parse(row.tool_call) : undefined,
    toolResult: row.tool_result ? JSON.parse(row.tool_result) : undefined,
    usage: row.usage ? JSON.parse(row.usage) : undefined,
    cost: row.cost ? JSON.parse(row.cost) : undefined,
    durationMs: row.duration_ms,
    startedAt: row.started_at,
    memoryWrites: row.memory_writes ? JSON.parse(row.memory_writes) : undefined,
  };
}

export async function getAgentRun(id: string): Promise<AgentRun | undefined> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM agent_runs WHERE id = ?`).get(id) as AgentRunRow | undefined;
  if (!row) return undefined;
  const stepRows = db
    .prepare(`SELECT * FROM agent_steps WHERE agent_run_id = ? ORDER BY idx ASC`)
    .all(id) as AgentStepRow[];

  return {
    id: row.id,
    runtime: row.runtime as AgentRun["runtime"],
    goal: row.goal,
    steps: stepRows.map(rowToStep),
    status: row.status as AgentStatus,
    stopReason: row.stop_reason ? (row.stop_reason as AgentStopReason) : undefined,
    limits: JSON.parse(row.limits),
    totals: JSON.parse(row.totals),
    traceId: row.trace_id ?? undefined,
    createdAt: row.created_at,
  };
}
