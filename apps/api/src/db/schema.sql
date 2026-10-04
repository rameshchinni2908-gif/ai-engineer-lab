-- AI Engineer Lab SQLite schema.
-- Applied idempotently at boot via db/migrate.ts (CREATE TABLE/INDEX IF NOT EXISTS).
-- Keep in sync with packages/shared Zod schemas; this is the persistence
-- shape, not the wire shape (JSON-serializable fields are stored as TEXT).

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  params TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  usage TEXT NOT NULL,
  cost TEXT NOT NULL,
  latency_ms REAL NOT NULL,
  ttft_ms REAL,
  tokens_per_second REAL,
  logprobs TEXT,
  status TEXT NOT NULL,
  error TEXT,
  seed INTEGER,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  parent_run_id TEXT,
  trace_id TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_runs_module_id ON runs (module_id);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs (created_at);
CREATE INDEX IF NOT EXISTS idx_runs_trace_id ON runs (trace_id);

CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  root_span_id TEXT NOT NULL,
  totals TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_traces_created_at ON traces (created_at);

CREATE TABLE IF NOT EXISTS spans (
  span_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  parent_span_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_ms REAL,
  attributes TEXT NOT NULL DEFAULT '{}',
  events TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans (trace_id);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  template TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '[]',
  system TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  parent_version_id TEXT,
  tags TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_name ON prompt_versions (name);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_created_at ON prompt_versions (created_at);

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_datasets_created_at ON datasets (created_at);

CREATE TABLE IF NOT EXISTS eval_cases (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  input TEXT NOT NULL,
  expected TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_eval_cases_dataset_id ON eval_cases (dataset_id);

CREATE TABLE IF NOT EXISTS eval_results (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  metric_id TEXT NOT NULL,
  score REAL NOT NULL,
  passed INTEGER NOT NULL,
  rationale TEXT,
  judge_run_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eval_results_dataset_id ON eval_results (dataset_id);
CREATE INDEX IF NOT EXISTS idx_eval_results_created_at ON eval_results (created_at);

CREATE TABLE IF NOT EXISTS eval_suite_results (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  variants TEXT NOT NULL,
  aggregates TEXT NOT NULL,
  regressions TEXT NOT NULL DEFAULT '[]',
  total_cost REAL NOT NULL DEFAULT 0,
  total_latency_ms REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eval_suite_results_dataset_id ON eval_suite_results (dataset_id);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  text TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  text TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  token_count INTEGER NOT NULL,
  embedding TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  parent_chunk_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks (document_id);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  runtime TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL,
  stop_reason TEXT,
  limits TEXT NOT NULL,
  totals TEXT NOT NULL,
  trace_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs (created_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_trace_id ON agent_runs (trace_id);

CREATE TABLE IF NOT EXISTS agent_steps (
  id TEXT PRIMARY KEY,
  agent_run_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_call TEXT,
  tool_result TEXT,
  usage TEXT,
  cost TEXT,
  duration_ms REAL NOT NULL,
  started_at TEXT NOT NULL,
  memory_writes TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_steps_agent_run_id ON agent_steps (agent_run_id);

CREATE TABLE IF NOT EXISTS guardrail_events (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  layer TEXT NOT NULL,
  severity TEXT NOT NULL,
  action TEXT NOT NULL,
  message TEXT NOT NULL,
  matched_text TEXT,
  owasp_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guardrail_events_run_id ON guardrail_events (run_id);
CREATE INDEX IF NOT EXISTS idx_guardrail_events_created_at ON guardrail_events (created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  request_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log (resource_type, resource_id);
