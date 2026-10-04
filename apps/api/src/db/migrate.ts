import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SqliteDatabase } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Applies the full schema. Every statement in schema.sql uses
 * `CREATE TABLE/INDEX IF NOT EXISTS`, so running this on every boot is
 * idempotent and safe.
 */
export function runMigrations(db: SqliteDatabase): void {
  const sql = readFileSync(join(here, "schema.sql"), "utf-8");
  db.exec(sql);
}
