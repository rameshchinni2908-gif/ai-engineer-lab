import type { GuardrailConfig, GuardrailFinding, GuardrailLayer, GuardrailReport } from "@ail/shared";
import { ATTACK_PAYLOADS, getAttackMeta, type AttackPayload } from "./attacks.js";
import { buildUndefendedOutput, DEMO_SECRET, DEMO_SYSTEM_PROMPT, SAFE_REFUSAL_TEXT } from "./bot.js";
import { notFoundError } from "../../middleware/errors.js";
import { writeAuditLog } from "./audit.js";
import {
  checkApprovalGates,
  checkDelimiterHardening,
  checkInjectionClassifier,
  checkInputValidation,
  checkInstructionHierarchy,
  checkLeastPrivilege,
  checkOutputModeration,
  checkPiiRedaction,
  checkSandbox,
  checkSchemaEnforcement,
  checkToolAllowList,
  recordAndCheckRateLimit,
} from "./layers.js";

export interface StageResult {
  layer: GuardrailLayer;
  findings: GuardrailFinding[];
}

export interface AttackRunResult {
  attackId: string;
  systemPrompt: string;
  userMessage: string;
  retrievedDocument?: string;
  stages: StageResult[];
  report: GuardrailReport;
  botOutput: string;
  /** True iff the secret/tool-abuse/exfiltration actually reached the user unblocked - the headline "did the attack succeed" signal the UI highlights. */
  attackSucceeded: boolean;
}

function isBlocked(findings: GuardrailFinding[]): boolean {
  return findings.some((f) => f.action === "block");
}

/**
 * Runs one named attack through the full, configurable 12-layer guardrail
 * pipeline against the deliberately-vulnerable demo bot. Deterministic and
 * offline (no live provider call needed for the attack/defense distinction
 * to be visible) so the module's headline "attack succeeds undefended, same
 * attack blocked once defenses are on" flow is 100% reliable - see
 * `pipeline.test.ts`.
 */
export function runAttackPipeline(attackId: string, config: GuardrailConfig, rateLimitKey = "demo-session"): AttackRunResult {
  const meta = getAttackMeta(attackId);
  const payload = ATTACK_PAYLOADS[attackId];
  if (!meta || !payload) throw notFoundError(`Attack ${attackId} not found`);

  const stages: StageResult[] = [];
  function record(layer: GuardrailLayer, findings: GuardrailFinding[]): void {
    stages.push({ layer, findings });
  }

  const combinedInputText = [payload.userMessage, payload.retrievedDocument].filter(Boolean).join("\n\n");
  let workingInputText = combinedInputText;

  if (config.inputValidation) record("inputValidation", checkInputValidation(combinedInputText));
  if (config.piiRedaction) {
    const { findings, redacted } = checkPiiRedaction(workingInputText);
    record("piiRedaction", findings);
    workingInputText = redacted;
  }
  if (config.injectionClassifier) record("injectionClassifier", checkInjectionClassifier(workingInputText));
  if (config.instructionHierarchy && payload.retrievedDocument) {
    record("instructionHierarchy", checkInstructionHierarchy(payload.retrievedDocument, "retrieved"));
  }
  if (config.delimiterHardening) record("delimiterHardening", checkDelimiterHardening(workingInputText));
  if (config.rateLimit) record("rateLimit", recordAndCheckRateLimit(rateLimitKey));

  const blockedAtInput = stages.some((s) => isBlocked(s.findings));

  // Tool stage - only relevant if this attack tries to abuse a tool, and only reached if input-stage defenses didn't already stop it.
  let toolBlocked = false;
  if (payload.attemptedTool && !blockedAtInput) {
    if (config.schemaEnforcement) record("schemaEnforcement", checkSchemaEnforcement(payload.attemptedTool));
    if (config.toolAllowList) record("toolAllowList", checkToolAllowList(payload.attemptedTool.name, config.toolAllowList));
    if (config.leastPrivilege) record("leastPrivilege", checkLeastPrivilege(payload.attemptedTool));
    if (config.sandbox) record("sandbox", checkSandbox(payload.attemptedTool));
    if (config.approvalGates) record("approvalGates", checkApprovalGates(payload.attemptedTool, false));

    const toolStageLayers: GuardrailLayer[] = [
      "schemaEnforcement",
      "toolAllowList",
      "leastPrivilege",
      "sandbox",
      "approvalGates",
    ];
    toolBlocked = stages
      .filter((s) => toolStageLayers.includes(s.layer))
      .some((s) => isBlocked(s.findings) || s.findings.some((f) => f.action === "flag"));
  }

  const toolSideEffectOccurred = Boolean(payload.attemptedTool) && !blockedAtInput && !toolBlocked;

  // Output stage - skipped entirely if the attack never reached generation (fully neutralized at input).
  let botOutput: string;
  if (blockedAtInput) {
    botOutput = SAFE_REFUSAL_TEXT;
  } else {
    const rawOutput = buildUndefendedOutput(payload, { toolSideEffectOccurred });
    if (config.outputModeration) {
      const { findings, redacted } = checkOutputModeration(rawOutput);
      record("outputModeration", findings);
      botOutput = redacted;
    } else {
      botOutput = rawOutput;
    }
  }

  const allFindings = stages.flatMap((s) => s.findings);
  const blocked = allFindings.some((f) => f.action === "block");
  const redactedInputFinding = stages.find((s) => s.layer === "piiRedaction");
  const redactedOutputFinding = stages.find((s) => s.layer === "outputModeration");

  const report: GuardrailReport = {
    findings: allFindings,
    blocked,
    redactedInput: redactedInputFinding && redactedInputFinding.findings.length > 0 ? workingInputText : undefined,
    redactedOutput:
      redactedOutputFinding && redactedOutputFinding.findings.length > 0 ? botOutput : undefined,
  };

  const attackSucceeded = attackDidSucceed(payload, botOutput, toolSideEffectOccurred, toolBlocked);

  return {
    attackId,
    systemPrompt: DEMO_SYSTEM_PROMPT,
    userMessage: payload.userMessage,
    retrievedDocument: payload.retrievedDocument,
    stages,
    report,
    botOutput,
    attackSucceeded,
  };
}

/**
 * Writes an `AuditLogEntry` for every `GuardrailFinding` with `action !==
 * "allow"` (per contracts §4 M8) plus one top-level entry for the attack run
 * itself. Separated from `runAttackPipeline` (which stays a pure, synchronous
 * function) so the pure/impure boundary is explicit and the pipeline logic
 * itself stays trivially unit-testable without a database.
 */
export async function persistAttackAudit(result: AttackRunResult, requestId?: string): Promise<void> {
  await writeAuditLog({
    actor: "system",
    action: "guardrail.attack.run",
    resourceType: "attack",
    resourceId: result.attackId,
    details: { attackSucceeded: result.attackSucceeded, findingCount: result.report.findings.length },
    requestId,
  });
  for (const f of result.report.findings) {
    if (f.action === "allow") continue;
    await writeAuditLog({
      actor: "system",
      action: `guardrail.finding.${f.action}`,
      resourceType: "guardrail_layer",
      resourceId: f.layer,
      details: { message: f.message, severity: f.severity, owaspId: f.owaspId, attackId: result.attackId },
      requestId,
    });
  }
}

function attackDidSucceed(
  payload: AttackPayload,
  finalOutput: string,
  toolSideEffectOccurred: boolean,
  toolBlocked: boolean,
): boolean {
  if (payload.leaksSecret && finalOutput.includes(DEMO_SECRET)) return true;
  if (payload.producesMarkdownImageExfil && /!\[[^\]]*\]\(https?:\/\//.test(finalOutput)) return true;
  if (payload.attemptedTool && toolSideEffectOccurred && !toolBlocked) return true;
  return false;
}
