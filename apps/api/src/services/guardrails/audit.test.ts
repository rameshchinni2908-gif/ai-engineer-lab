import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-guardrails-audit.db");

const { closeDb } = await import("../../db/index.js");
const { writeAuditLog, listAuditLog } = await import("./audit.js");
const { runAttackPipeline } = await import("./pipeline.js");
const { persistAttackAudit } = await import("./pipeline.js");
const { DEFAULT_GUARDRAIL_CONFIG, FULLY_DEFENDED_CONFIG } = await import("./config.js");

describe("audit log", () => {
  afterAll(() => closeDb());

  it("writes and lists entries, most recent first", async () => {
    await writeAuditLog({ actor: "system", action: "test.one", resourceType: "test", details: {} });
    await writeAuditLog({ actor: "system", action: "test.two", resourceType: "test", details: {} });
    const result = await listAuditLog({ resourceType: "test" });
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    expect(result.items[0]!.action).toBe("test.two");
  });

  it("records an attack run, blocked, with an AuditLogEntry per non-allow finding", async () => {
    const result = runAttackPipeline("direct-injection-reveal-secret", FULLY_DEFENDED_CONFIG);
    await persistAttackAudit(result, "req_attack_1");
    const log = await listAuditLog({ resourceType: "attack" });
    expect(log.items.some((e) => e.action === "guardrail.attack.run" && e.resourceId === "direct-injection-reveal-secret")).toBe(
      true,
    );
    const layerLog = await listAuditLog({ resourceType: "guardrail_layer" });
    expect(layerLog.items.length).toBeGreaterThan(0);
    expect(layerLog.items.every((e) => e.action.startsWith("guardrail.finding."))).toBe(true);
  });

  it("records a successful (undefended) attack too - the audit trail shows attacks, not just blocks", async () => {
    const result = runAttackPipeline("direct-injection-reveal-secret", DEFAULT_GUARDRAIL_CONFIG);
    expect(result.attackSucceeded).toBe(true);
    await persistAttackAudit(result, "req_attack_2");
    const log = await listAuditLog({ resourceType: "attack" });
    const entry = log.items.find((e) => e.requestId === "req_attack_2");
    expect(entry?.details.attackSucceeded).toBe(true);
  });
});
