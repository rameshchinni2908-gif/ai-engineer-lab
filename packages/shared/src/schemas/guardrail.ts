import { z } from "zod";

/** One boolean/config field per defense layer, toggleable in the Guardrails & Security module. */
export const GuardrailConfigSchema = z.object({
  inputValidation: z.boolean(),
  piiRedaction: z.boolean(),
  injectionClassifier: z.boolean(),
  instructionHierarchy: z.boolean(),
  delimiterHardening: z.boolean(),
  outputModeration: z.boolean(),
  schemaEnforcement: z.boolean(),
  toolAllowList: z.array(z.string()),
  leastPrivilege: z.boolean(),
  sandbox: z.boolean(),
  rateLimit: z.boolean(),
  approvalGates: z.boolean(),
});
export type GuardrailConfig = z.infer<typeof GuardrailConfigSchema>;

export const GuardrailLayerSchema = z.enum([
  "inputValidation",
  "piiRedaction",
  "injectionClassifier",
  "instructionHierarchy",
  "delimiterHardening",
  "outputModeration",
  "schemaEnforcement",
  "toolAllowList",
  "leastPrivilege",
  "sandbox",
  "rateLimit",
  "approvalGates",
]);
export type GuardrailLayer = z.infer<typeof GuardrailLayerSchema>;

export const GuardrailSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type GuardrailSeverity = z.infer<typeof GuardrailSeveritySchema>;

export const GuardrailActionSchema = z.enum(["allow", "redact", "block", "flag"]);
export type GuardrailAction = z.infer<typeof GuardrailActionSchema>;

export const GuardrailFindingSchema = z.object({
  layer: GuardrailLayerSchema,
  severity: GuardrailSeveritySchema,
  action: GuardrailActionSchema,
  message: z.string(),
  matchedText: z.string().optional(),
  /** OWASP LLM Top 10 identifier, e.g. "LLM01". */
  owaspId: z.string().optional(),
});
export type GuardrailFinding = z.infer<typeof GuardrailFindingSchema>;

export const GuardrailReportSchema = z.object({
  findings: z.array(GuardrailFindingSchema),
  blocked: z.boolean(),
  redactedInput: z.string().optional(),
  redactedOutput: z.string().optional(),
});
export type GuardrailReport = z.infer<typeof GuardrailReportSchema>;
