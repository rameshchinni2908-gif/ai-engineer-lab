import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { SqliteDatabase, SqliteDriverName } from "./types.js";

export interface OpenDatabaseResult {
  db: SqliteDatabase;
  driver: SqliteDriverName;
}

/**
 * Opens the SQLite database, preferring `better-sqlite3` (native, fast) and
 * transparently falling back to the Node 22+ built-in `node:sqlite` module if
 * the native addon fails to load on this machine (e.g. no prebuilt binary for
 * the current Node ABI). Both drivers expose the same run/get/all/exec/close
 * surface, so callers never branch on which one is active.
 *
 * See docs/adr/0001-sqlite-driver-fallback.md if the fallback path is ever
 * exercised in practice.
 */
export async function openDatabase(path: string): Promise<OpenDatabaseResult> {
  mkdirSync(dirname(path), { recursive: true });

  try {
    const betterSqlite3Module = await import("better-sqlite3");
    const BetterSqlite3 = betterSqlite3Module.default;
    const db = new BetterSqlite3(path) as unknown as SqliteDatabase;
    db.exec("PRAGMA journal_mode = WAL;");
    return { db, driver: "better-sqlite3" };
  } catch {
    const nodeSqlite = await import("node:sqlite");
    const raw = new nodeSqlite.DatabaseSync(path);
    // node:sqlite's DatabaseSync already matches exec/prepare/close, and its
    // StatementSync already matches run/get/all - cast through unknown since
    // the two packages' TS types are structurally compatible but not nominally.
    const db = raw as unknown as SqliteDatabase;
    return { db, driver: "node:sqlite" };
  }
}
