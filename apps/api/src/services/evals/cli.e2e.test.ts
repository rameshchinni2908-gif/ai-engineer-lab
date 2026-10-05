import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SseEvent } from "@ail/shared";
import type { SseWriter } from "../../plugins/sse.js";

process.env.DATABASE_PATH = join(process.cwd(), "data", "test-cli-e2e.db");
process.env.LLM_PROVIDER = "mock";
process.env.RATE_LIMIT_MAX = "1000";

const { buildApp } = await import("../../app.js");
const { getDb, closeDb } = await import("../../db/index.js");
const { insertDataset } = await import("./store.js");
const { runEvalSuite } = await import("./runner.js");

const execFileAsync = promisify(execFile);

function fakeWriter(): SseWriter {
  return {
    send(_ev: SseEvent) {},
    ping() {},
    close() {},
  };
}

/**
 * Spawns the real CLI as a child process and returns its exit code/stdout.
 * MUST be async (`execFile`, not `execFileSync`): the Fastify server under
 * test runs in THIS SAME process, so a synchronous spawn would block this
 * process's event loop while waiting for the child - deadlocking, since the
 * child's HTTP request to that very server could never be serviced.
 */
async function runCliProcess(args: string[]): Promise<{ status: number; stdout: string }> {
  const cliScript = fileURLToPath(new URL("./cli.ts", import.meta.url));
  const tsxCli = fileURLToPath(new URL("../../../node_modules/tsx/dist/cli.mjs", import.meta.url));
  try {
    const { stdout } = await execFileAsync(process.execPath, [tsxCli, cliScript, ...args], {
      encoding: "utf-8",
      timeout: 20_000,
    });
    return { status: 0, stdout };
  } catch (err) {
    const e = err as { code?: number; stdout?: string };
    return { status: e.code ?? 1, stdout: e.stdout ?? "" };
  }
}

describe("evals CI CLI - real spawned process, real exit codes (contracts §4 M7)", () => {
  it("exits 0 when the suite passes, and non-zero when it regresses below threshold", async () => {
    const app = await buildApp({ logger: false });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const apiUrl = `http://127.0.0.1:${port}`;

    try {
      const db = await getDb();
      const promptVersionId = "pv_cli_e2e_test";
      db.prepare(
        `INSERT OR REPLACE INTO prompt_versions (id, name, version, template, variables, system, notes, created_at, parent_version_id, tags)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        promptVersionId,
        "cli-e2e",
        1,
        "What is 2+2? Answer with just the number.",
        "[]",
        null,
        null,
        new Date().toISOString(),
        null,
        "[]",
      );

      const dataset = await insertDataset({
        name: "cli-e2e-dataset",
        cases: [{ id: "case_1", input: {}, expected: "4", tags: [], metadata: {} }],
      });

      // MockProvider's deterministic output for this prompt will NOT be the
      // literal string "4" (it has no real arithmetic understanding), so
      // exact_match scores 0 here - exactly the "known regression" fixture
      // this test needs for a reliable, deterministic exit-code check.
      const suite = await runEvalSuite({
        datasetId: dataset.id,
        variants: [{ promptVersionId, providerId: "mock", model: "mock-small" }],
        metricIds: ["exact_match"],
        writer: fakeWriter(),
      });
      expect(suite.aggregates[0]!.exact_match).toBe(0);

      const passRun = await runCliProcess(["--suite", suite.id, "--threshold", "exact_match=0", "--api-url", apiUrl]);
      expect(passRun.status).toBe(0);
      expect(passRun.stdout).toContain("PASS");

      const failRun = await runCliProcess([
        "--suite",
        suite.id,
        "--threshold",
        "exact_match=0.5",
        "--api-url",
        apiUrl,
      ]);
      expect(failRun.status).not.toBe(0);
      expect(failRun.stdout).toContain("FAIL");
      expect(failRun.stdout).toContain("exact_match");
    } finally {
      await app.close();
      closeDb();
    }
  }, 30_000);
});
