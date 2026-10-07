import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "mobile.spec.ts",
  outputDir: "test-results/mobile",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: process.env.MOBILE_TEST_URL || "http://localhost:4175",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile-chromium", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  webServer: process.env.MOBILE_TEST_URL ? undefined : {
    command: "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4175 --strictPort",
    url: "http://localhost:4175",
    reuseExistingServer: !process.env.CI,
  },
});
