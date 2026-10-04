import { openDatabase } from "./open.js";
import { runMigrations } from "./migrate.js";
import type { SqliteDatabase, SqliteDriverName } from "./types.js";

export type { SqliteDatabase, SqliteStatement, SqliteDriverName } from "./types.js";

let dbSingleton: SqliteDatabase | undefined;
let driverSingleton: SqliteDriverName | undefined;

/**
 * Opens (once) and migrates the SQLite database at `DATABASE_PATH`
 * (default `./data/lab.db`). Services should depend on this function, never
 * reach for a driver package directly - that keeps the better-sqlite3 /
 * node:sqlite swap fully contained to db/open.ts.
 */
export async function getDb(): Promise<SqliteDatabase> {
  if (dbSingleton) return dbSingleton;
  const path = process.env.DATABASE_PATH ?? "./data/lab.db";
  const { db, driver } = await openDatabase(path);
  runMigrations(db);
  dbSingleton = db;
  driverSingleton = driver;
  return db;
}

export function getDriverName(): SqliteDriverName | undefined {
  return driverSingleton;
}

export function closeDb(): void {
  dbSingleton?.close();
  dbSingleton = undefined;
  driverSingleton = undefined;
}
