import { beforeEach, describe, expect, it } from "vitest";
import { ATTACK_CATALOG, ATTACK_PAYLOADS } from "./attacks.js";
import { DEFAULT_GUARDRAIL_CONFIG, FULLY_DEFENDED_CONFIG } from "./config.js";
import { checkDelimiterHardening, checkInjectionClassifier, checkInputValidation, resetRateLimitState } from "./layers.js";
import { runAttackPipeline } from "./pipeline.js";

describe("runAttackPipeline - the headline attack -> defend -> re-run flow", () => {
  beforeEach(() => resetRateLimitState());

  it("direct injection succeeds completely undefended, then is blocked once defenses are enabled (SAME attack, re-run)", () => {
    const undefended = runAttackPipeline("direct-injection-reveal-secret", DEFAULT_GUARDRAIL_CONFIG);
    expect(undefended.attackSucceeded).toBe(true);
    expect(undefended.botOutput).toContain("sk-demo-");

    const defended = runAttackPipeline("direct-injection-reveal-secret", FULLY_DEFENDED_CONFIG);
    expect(defended.attackSucceeded).toBe(false);
    expect(defended.botOutput).not.toContain("sk-demo-");
    // The explanation names which layer stopped it.
    const blockingStage = defended.stages.find((s) => s.findings.some((f) => f.action === "block"));
    expect(blockingStage?.layer).toBe("injectionClassifier");
  });

  it("indirect injection (poisoned retrieved document) succeeds undefended and is caught by instructionHierarchy when defended", () => {
    const undefended = runAttackPipeline("indirect-injection-poisoned-document", DEFAULT_GUARDRAIL_CONFIG);
    expect(undefended.attackSucceeded).toBe(true);

    const defended = runAttackPipeline("indirect-injection-poisoned-document", FULLY_DEFENDED_CONFIG);
    expect(defended.attackSucceeded).toBe(false);
    expect(defended.stages.some((s) => s.layer === "instructionHierarchy" && s.findings.some((f) => f.action === "block"))).toBe(
      true,
    );
  });

  it("jailbreak persona override succeeds undefended and is caught by injectionClassifier when defended", () => {
    const undefended = runAttackPipeline("jailbreak-persona-override", DEFAULT_GUARDRAIL_CONFIG);
    expect(undefended.attackSucceeded).toBe(true);

    const defended = runAttackPipeline("jailbreak-persona-override", FULLY_DEFENDED_CONFIG);
    expect(defended.attackSucceeded).toBe(false);
  });

  it("markdown-image exfiltration succeeds undefended and is blocked by outputModeration when defended", () => {
    const undefended = runAttackPipeline("markdown-image-exfiltration", DEFAULT_GUARDRAIL_CONFIG);
    expect(undefended.attackSucceeded).toBe(true);
    expect(undefended.botOutput).toMatch(/!\[.*\]\(http/);

    const defended = runAttackPipeline("markdown-image-exfiltration", FULLY_DEFENDED_CONFIG);
    expect(defended.attackSucceeded).toBe(false);
    expect(defended.botOutput).not.toMatch(/!\[.*\]\(http/);
    expect(defended.stages.some((s) => s.layer === "outputModeration" && s.findings.some((f) => f.action === "block"))).toBe(
      true,
    );
  });

  it("tool abuse succeeds undefended (open allow-list) and is blocked by toolAllowList/leastPrivilege when defended", () => {
    const undefended = runAttackPipeline("tool-abuse-unauthorized-action", DEFAULT_GUARDRAIL_CONFIG);
    expect(undefended.attackSucceeded).toBe(true);

    const defended = runAttackPipeline("tool-abuse-unauthorized-action", FULLY_DEFENDED_CONFIG);
    expect(defended.attackSucceeded).toBe(false);
    const toolStageBlockers = defended.stages.filter(
      (s) => ["toolAllowList", "leastPrivilege"].includes(s.layer) && s.findings.some((f) => f.action === "block"),
    );
    expect(toolStageBlockers.length).toBeGreaterThan(0);
  });

  it("prompt leak succeeds undefended and is caught by injectionClassifier when defended", () => {
    const undefended = runAttackPipeline("prompt-leak-verbatim-system-prompt", DEFAULT_GUARDRAIL_CONFIG);
    expect(undefended.attackSucceeded).toBe(true);

    const defended = runAttackPipeline("prompt-leak-verbatim-system-prompt", FULLY_DEFENDED_CONFIG);
    expect(defended.attackSucceeded).toBe(false);
  });

  it("every attack in the catalog that SHOULD succeed undefended actually does (not just 'runs without throwing')", () => {
    // Every attack in this catalog is designed to leak the secret, exfiltrate
    // via markdown image, or abuse a tool - so with every layer off and the
    // tool allow-list fully open, attackSucceeded must be true for ALL of
    // them. A weaker assertion (e.g. "report is defined") would still pass
    // even if every attack silently failed to succeed undefended, which is
    // exactly the regression this test exists to catch.
    for (const attack of ATTACK_CATALOG) {
      const payload = ATTACK_PAYLOADS[attack.id];
      expect(payload).toBeDefined();
      const shouldSucceedUndefended = Boolean(
        payload!.leaksSecret || payload!.producesMarkdownImageExfil || payload!.attemptedTool,
      );
      expect(shouldSucceedUndefended).toBe(true); // sanity check on the catalog itself

      const result = runAttackPipeline(attack.id, DEFAULT_GUARDRAIL_CONFIG);
      expect(result.attackSucceeded).toBe(true);
    }
  });

  it("every GuardrailFinding that isn't 'allow' corresponds to a real action and layer (for audit-log completeness)", () => {
    const result = runAttackPipeline("direct-injection-reveal-secret", FULLY_DEFENDED_CONFIG);
    for (const f of result.report.findings) {
      expect(["redact", "block", "flag"]).toContain(f.action);
      expect(f.layer).toBeTruthy();
    }
  });

  it("a benign, non-attack-shaped message produces no blocking findings even with full defenses on (no false-positive-everything)", () => {
    // Reuses the pipeline's own layer functions directly on a benign input,
    // mirroring what the attack pipeline would do for ordinary traffic.
    const benign = "Can you help me summarize this quarterly report in three bullet points?";
    expect(checkInjectionClassifier(benign)).toEqual([]);
    expect(checkDelimiterHardening(benign)).toEqual([]);
    expect(checkInputValidation(benign)).toEqual([]);
  });
});
