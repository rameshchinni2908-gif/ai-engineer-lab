import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";

/**
 * A single row in the `audit_log` table. Written by guardrail decisions
 * (M8), destructive admin actions (dataset/document delete, config change),
 * and anything else CLAUDE.md's security rules require a trail for.
 * Shared because both the Guardrails & Security module and the Production
 * module's observability views read this table.
 */
export const AuditLogEntrySchema = z.object({
  id: z.string(),
  actor: z.string().default("system"),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().optional(),
  details: z.record(z.string(), z.unknown()),
  requestId: z.string().optional(),
  createdAt: IsoDateTimeSchema,
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
