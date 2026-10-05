import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    /**
     * Module-page smoke tests render a React.lazy page through <Suspense> with
     * Monaco/Recharts in the tree; each takes ~2-3s on its own and legitimately
     * exceeds Vitest's 5s default once ~17 test files compete for CPU. They pass
     * in isolation, so this is CPU contention, not a hang - raise the ceiling
     * rather than let module agents each patch their own timeouts.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
