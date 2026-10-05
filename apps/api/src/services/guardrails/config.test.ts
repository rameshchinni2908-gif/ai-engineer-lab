import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync } from "node:fs";

const dbPath = join(process.cwd(), "data", "test-guardrails-config.db");
// This file specifically asserts "no config has ever been persisted yet", so
// (unlike other test-*.db files in this repo, which intentionally persist
// across runs since every row they write has a fresh random id) it needs a
// genuinely fresh database rather than reusing a prior run's single-row
// kv_settings state.
for (const suffix of ["", "-shm", "-wal"]) {
  if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
}
process.env.DATABASE_PATH = dbPath;

const { closeDb } = await import("../../db/index.js");
const { getGuardrailConfig, setGuardrailConfig, DEFAULT_GUARDRAIL_CONFIG } = await import("./config.js");
const { listAuditLog } = await import("./audit.js");

describe("guardrail config persistence", () => {
  afterAll(() => closeDb());

  it("returns the default config before anything has been persisted", async () => {
    expect(await getGuardrailConfig()).toEqual(DEFAULT_GUARDRAIL_CONFIG);
  });

  it("persists an updated config and returns it on subsequent reads", async () => {
    const updated = { ...DEFAULT_GUARDRAIL_CONFIG, piiRedaction: true, injectionClassifier: true };
    await setGuardrailConfig(updated);
    expect(await getGuardrailConfig()).toEqual(updated);
  });

  it("writes a guardrail.config.update AuditLogEntry on every config change", async () => {
    await setGuardrailConfig({ ...DEFAULT_GUARDRAIL_CONFIG, sandbox: true }, "req_test_1");
    const log = await listAuditLog({ resourceType: "guardrail_config" });
    expect(log.items.some((e) => e.action === "guardrail.config.update" && e.requestId === "req_test_1")).toBe(true);
  });
});
