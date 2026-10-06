import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Wipe per-suite SQLite scratch databases ONCE before the suite runs.
 *
 * 31 test files pin a fixed `DATABASE_PATH` under `data/` (e.g.
 * `data/test-embed-service.db`). Those files survive the process, so a second
 * local run starts with rows the first run inserted. Most tests don't notice,
 * but any test that asserts a COUNT does: `embed.test.ts` asserts exactly one
 * error Run exists for a static `feature` tag, so run 1 passes and run 2 fails
 * with "expected 1, got 2" - while the code under test is perfectly correct.
 *
 * That failure mode is worse than a plain bug: it makes a *correct* fix look
 * broken, and it makes "N consecutive green runs" unachievable without manual
 * cleanup between runs - which silently voids the whole point of running a
 * suite repeatedly to detect flakiness.
 *
 * Fixing it here rather than in each test file means a newly added test cannot
 * reintroduce it by forgetting its own teardown.
 *
 * Scoped deliberately to the `test-*.db` prefix: `lab.db` (local dev data),
 * `e2e-playwright.db` and `pw-test.db` (owned by the Playwright run, which has
 * its own lifecycle) must survive untouched.
 */
export function setup(): void {
  const dataDir = join(process.cwd(), "data");
  let entries: string[];
  try {
    entries = readdirSync(dataDir);
  } catch {
    return; // no data/ yet - nothing to clean (fresh checkout / CI)
  }
  for (const name of entries) {
    // Matches the db plus its WAL/SHM sidecars: test-foo.db, -wal, -shm.
    if (!/^test-.*\.db(-wal|-shm)?$/.test(name)) continue;
    try {
      rmSync(join(dataDir, name), { force: true });
    } catch {
      // Best-effort BY DESIGN. On Windows a stale scratch db can still be
      // locked by another process (EPERM), and `force: true` does not override
      // a lock. Cleanup is an optimisation for repeat-run reproducibility, so
      // it must never be able to fail the suite: a globalSetup that throws
      // aborts collection entirely and reports "no tests" - turning a tidy-up
      // problem into a total, and very confusing, suite outage. Skipping one
      // undeletable file at worst leaves that one suite's rows accumulating,
      // which is exactly the pre-existing behaviour.
    }
  }
}
