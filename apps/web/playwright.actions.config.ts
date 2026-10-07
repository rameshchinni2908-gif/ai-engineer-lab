import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "lab-actions.spec.ts",
  outputDir: "test-results/actions",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["iPhone 13"],
    browserName: "chromium",
    baseURL: process.env.LAB_TEST_URL || "http://localhost:5176",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.LAB_TEST_URL ? undefined : [
    {
      command: "node node_modules/tsx/dist/cli.mjs src/server.ts",
      cwd: "../api",
      url: "http://localhost:8788/api/health",
      env: { PORT: "8788", WEB_ORIGIN: "http://localhost:5176", DATABASE_PATH: "./data/e2e-actions.db", LLM_PROVIDER: "mock", VECTOR_STORE: "memory", SEED_DEMO_DATA: "true", RATE_LIMIT_MAX: "1000" },
      timeout: 60_000,
    },
    {
      command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5176 --strictPort",
      url: "http://localhost:5176",
      env: { VITE_API_BASE_URL: "http://localhost:8788/api" },
      timeout: 60_000,
    },
  ],
});
