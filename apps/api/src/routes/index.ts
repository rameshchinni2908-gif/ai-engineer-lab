import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

interface ModuleRouteEntry {
  folder: string;
  prefix: string;
}

/**
 * Fixed, exhaustive registry of every Wave-2 module route folder and its
 * mount prefix (docs/contracts.md §9.1). This list never grows in Wave 2 -
 * it already accounts for every prefix in contracts §4. Platform routes
 * (`/health`, `/models`, `/providers`, `/runs`, `/traces`, `/explain-run`)
 * are NOT in this list; they're registered directly in `app.ts`.
 */
const MODULE_ROUTES: ModuleRouteEntry[] = [
  { folder: "fundamentals", prefix: "/fundamentals" },
  { folder: "prompting", prefix: "/prompting" },
  { folder: "structured", prefix: "/structured" },
  { folder: "embeddings", prefix: "/embeddings" },
  { folder: "vector", prefix: "/vector" },
  { folder: "rag", prefix: "/rag" },
  { folder: "agents", prefix: "/agents" },
  { folder: "mcp", prefix: "/mcp" },
  { folder: "evals", prefix: "/evals" },
  { folder: "guardrails", prefix: "/guardrails" },
  { folder: "production", prefix: "/production" },
  { folder: "advanced", prefix: "/advanced" },
  { folder: "checklist", prefix: "/checklist" },
];

const here = dirname(fileURLToPath(import.meta.url));

/** `true` iff `err` represents "this module's file doesn't exist", never a real bug inside an existing module. */
function isModuleNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    ((err as { code?: unknown }).code === "ERR_MODULE_NOT_FOUND" ||
      (err as { code?: unknown }).code === "MODULE_NOT_FOUND")
  );
}

/**
 * `true` iff a route plugin file exists on disk for `folder`, checked
 * BEFORE attempting the dynamic import. This is a more robust guard than
 * relying solely on catching `ERR_MODULE_NOT_FOUND` from `import()` - it
 * works identically whether running compiled `dist/**\/*.js` (production),
 * `tsx` (dev, `.ts`), or Vitest's Vite-based module loader (which otherwise
 * throws its own resolution error before Node's module resolution ever
 * gets a chance to produce `ERR_MODULE_NOT_FOUND`).
 */
function moduleFileExists(folder: string): boolean {
  return existsSync(join(here, folder, "index.js")) || existsSync(join(here, folder, "index.ts"));
}

/**
 * Registers every Wave-2 module's route plugin via a guarded dynamic import,
 * so the server boots cleanly today with zero module folders present and
 * silently picks up each Wave-2 folder as it lands, with no edit to this
 * file or `app.ts` (per contracts.md §9.3 - this file is the seam).
 */
export async function registerModuleRoutes(app: FastifyInstance): Promise<void> {
  for (const { folder, prefix } of MODULE_ROUTES) {
    if (!moduleFileExists(folder)) {
      app.log.warn(`[routes] ${folder} not implemented yet, skipping`);
      continue;
    }
    try {
      // `@vite-ignore`: this import specifier is dynamic only because the
      // list of folders is data-driven, not because of any bundler concern
      // (Node resolves it directly at runtime); the comment just silences
      // Vite/vite-node's static-analysis warning under Vitest.
      const mod = (await import(/* @vite-ignore */ `./${folder}/index.js`)) as { default: unknown };
      // `mod.default` is a Fastify plugin function from a module folder this
      // file never imports statically (that's the whole point of the guarded
      // dynamic import). `never` (not `any`) is used purely to satisfy
      // `app.register`'s generic plugin-function signature here.
      await app.register(mod.default as never, { prefix: `/api${prefix}` });
    } catch (err) {
      if (isModuleNotFoundError(err)) {
        app.log.warn(`[routes] ${folder} not implemented yet, skipping`);
      } else {
        throw err;
      }
    }
  }
}
