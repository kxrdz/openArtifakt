/** Values accepted as SQLite bind parameters by both storage engines. */
export type SqliteValue = string | number | bigint | Uint8Array | null;

/** Result of a statement `run`, normalized across engines. */
export interface SqliteRunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

/** A prepared statement, normalized across engines. */
export interface SqliteStatement {
  run(...params: SqliteValue[]): SqliteRunResult;
  get(...params: SqliteValue[]): unknown;
  all(...params: SqliteValue[]): unknown[];
}

/**
 * The minimal SQLite connection surface shared by `better-sqlite3` and
 * `node:sqlite` (§11, "Persistence"). Both engines are adapted to this
 * interface so the {@link import("./repository").Repository} and the migration
 * runner never care which one is backing them — this is what lets the
 * {@link import("./factory").openRepository} factory swap engines.
 */
export interface SqliteConnection {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  /** Run `fn` atomically. `better-sqlite3` maps to `db.transaction`; `node:sqlite` emulates it. */
  transaction<T>(fn: () => T): T;
  close(): void;
}
