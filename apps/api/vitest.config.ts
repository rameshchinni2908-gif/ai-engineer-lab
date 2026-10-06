import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Clears accumulated per-suite SQLite scratch DBs so repeat local runs are
    // reproducible - see vitest.global-setup.ts for why this must be central.
    globalSetup: ["./vitest.global-setup.ts"],
  },
});
