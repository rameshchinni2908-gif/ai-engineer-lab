import type { GuardrailConfig } from "@ail/shared";
import { getDb } from "../../db/index.js";
import { OPEN_TOOL_ALLOW_LIST } from "./bot.js";
import { writeAuditLog } from "./audit.js";

const KV_KEY = "guardrail_config";

/** Starting point: everything OFF and every tool allowed, so a fresh install's first attack demo visibly succeeds undefended (the module's headline flow) before the user ever touches a toggle. */
export const DEFAULT_GUARDRAIL_CONFIG: GuardrailConfig = {
  inputValidation: false,
  piiRedaction: false,
  injectionClassifier: false,
  instructionHierarchy: false,
  delimiterHardening: false,
  outputModeration: false,
  schemaEnforcement: false,
  toolAllowList: OPEN_TOOL_ALLOW_LIST,
  leastPrivilege: false,
  sandbox: false,
  rateLimit: false,
  approvalGates: false,
};

/** All twelve layers fully engaged - the "defended" end state the UI's "enable defenses and re-run" step reaches. */
export const FULLY_DEFENDED_CONFIG: GuardrailConfig = {
  inputValidation: true,
  piiRedaction: true,
  injectionClassifier: true,
  instructionHierarchy: true,
  delimiterHardening: true,
  outputModeration: true,
  schemaEnforcement: true,
  toolAllowList: ["read_file", "web_search"],
  leastPrivilege: true,
  sandbox: true,
  rateLimit: true,
  approvalGates: true,
};

interface KvRow {
  key: string;
  value: string;
  updated_at: string;
}

export async function getGuardrailConfig(): Promise<GuardrailConfig> {
  const db = await getDb();
  const row = db.prepare(`SELECT * FROM kv_settings WHERE key = ?`).get(KV_KEY) as KvRow | undefined;
  if (!row) return DEFAULT_GUARDRAIL_CONFIG;
  return JSON.parse(row.value) as GuardrailConfig;
}

export async function setGuardrailConfig(config: GuardrailConfig, requestId?: string): Promise<GuardrailConfig> {
  const db = await getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO kv_settings (key, value, updated_at) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(KV_KEY, JSON.stringify(config), now);
  await writeAuditLog({
    actor: "user",
    action: "guardrail.config.update",
    resourceType: "guardrail_config",
    details: { config },
    requestId,
  });
  return config;
}
