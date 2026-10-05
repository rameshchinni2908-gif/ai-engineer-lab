import type { AuditLogEntry, GuardrailConfig, Paginated } from "@ail/shared";
import { apiFetch } from "@/lib/api";

/** `GET /api/guardrails/config` */
export function getGuardrailConfig(): Promise<GuardrailConfig> {
  return apiFetch<GuardrailConfig>("/guardrails/config");
}

/** `PUT /api/guardrails/config` */
export function putGuardrailConfig(config: GuardrailConfig): Promise<GuardrailConfig> {
  return apiFetch<GuardrailConfig>("/guardrails/config", { method: "PUT", body: config });
}

export interface AttackMeta {
  id: string;
  name: string;
  category: "direct_injection" | "indirect_injection" | "jailbreak" | "exfiltration" | "tool_abuse" | "prompt_leak";
  owaspId: string;
  description: string;
}

/** `GET /api/guardrails/attacks` */
export function listAttacks(): Promise<{ attacks: AttackMeta[] }> {
  return apiFetch("/guardrails/attacks");
}

export interface OwaspMapping {
  owaspId: string;
  title: string;
  attackIds: string[];
}

/** `GET /api/guardrails/owasp-map` */
export function getOwaspMap(): Promise<{ mappings: OwaspMapping[] }> {
  return apiFetch("/guardrails/owasp-map");
}

/** `GET /api/guardrails/audit-log` */
export function getAuditLog(params: { resourceType?: string; page?: number; pageSize?: number } = {}): Promise<
  Paginated<AuditLogEntry>
> {
  return apiFetch("/guardrails/audit-log", { query: params });
}
