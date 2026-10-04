// Copies non-TS runtime assets (SQL schema) into dist/ after tsc build.
// Plain Node ESM so it runs identically on Windows/macOS/Linux with no deps.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const copies = [["src/db/schema.sql", "dist/db/schema.sql"]];

for (const [from, to] of copies) {
  const src = join(root, from);
  const dest = join(root, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`[copy-assets] ${from} -> ${to}`);
}
