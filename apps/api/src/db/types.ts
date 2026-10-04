/**
 * Minimal synchronous SQLite surface shared by both possible drivers
 * (`better-sqlite3` and the Node built-in `node:sqlite` fallback). Keeping
 * this interface tiny means swapping drivers never touches call sites.
 */
export interface SqliteStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

export type SqliteDriverName = "better-sqlite3" | "node:sqlite";
