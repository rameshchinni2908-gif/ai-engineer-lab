import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke config for AI Engineer Lab (owner: qa-engineer, see CLAUDE.md
 * file-ownership rules — this file and `e2e/**` are additive-only, no production
 * code here).
 *
 * Port choice: 5173 is permanently occupied on this machine by Docker Desktop's
 * `wslrelay`, so Vite cannot bind it under Playwright. We run the web dev server
 * on 5174 instead by passing `--port 5174 --strictPort` on the `vite` CLI
 * invocation below, rather than editing `apps/web/vite.config.ts` (owned by
 * `frontend-shell`) — `--strictPort` makes Vite fail loudly instead of silently
 * picking a different port if 5174 is ever unavailable too, so a flaky "works on
 * my machine" port fallback can never mask a real startup failure here.
 *
 * The API keeps its pinned default port, 8787 (`.env.example`), and is started
 * with `LLM_PROVIDER=mock` (also the default when unset) and zero API keys, per
 * CLAUDE.md's "app MUST work with zero API keys" rule. `WEB_ORIGIN` is pointed at
 * the 5174 dev server so the API's scoped CORS allow-list (not `origin: true`)
 * doesn't reject the browser's requests. `DATABASE_PATH` is a dedicated e2e
 * SQLite file (not the developer's `./data/lab.db`) so smoke runs never pollute
 * or depend on local dev data, and parallel `pnpm test`/`pnpm dev` runs don't
 * collide with this suite over the same file.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // Deliberately NOT `tsx watch`: its file-watcher raced with the SQLite
      // WAL file churn this suite itself generates (`data/e2e-playwright.db-wal`)
      // and intermittently restarted the server mid-run, crashing with
      // EADDRINUSE because the old listener hadn't released port 8787 yet
      // before the respawned one tried to bind it. A one-shot `tsx` run has
      // no watcher, so no respawn race, matching how `webServer` is meant to
      // be used (start once, reuse for the whole suite).
      command: "pnpm --filter @ail/api exec tsx src/server.ts",
      cwd: "../../",
      url: "http://localhost:8787/api/health",
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: {
        LLM_PROVIDER: "mock",
        PORT: "8787",
        WEB_ORIGIN: "http://localhost:5174",
        DATABASE_PATH: "./data/e2e-playwright.db",
      },
    },
    {
      command: "pnpm --filter @ail/web exec vite --port 5174 --strictPort",
      cwd: "../../",
      url: "http://localhost:5174",
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
