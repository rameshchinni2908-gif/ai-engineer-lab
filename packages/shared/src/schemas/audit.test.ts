import { describe, expect, it } from "vitest";
import { AuditLogEntrySchema } from "./audit.js";

describe("AuditLogEntrySchema", () => {
  it("parses a minimal guardrail-block audit entry", () => {
    const entry = AuditLogEntrySchema.parse({
      id: "audit_1",
      actor: "system",
      action: "guardrail.block",
      resourceType: "run",
      resourceId: "run_1",
      details: { layer: "injectionClassifier" },
      createdAt: new Date().toISOString(),
    });
    expect(entry.action).toBe("guardrail.block");
  });
});
