import Database from "better-sqlite3";

/**
 * SQLite connection wrapper (§11). Opens (creating if needed) the database at
 * `path` and applies the app's pragmas: WAL journaling for concurrent
 * readers, foreign-key enforcement, and a busy timeout so a concurrent writer
 * waits briefly rather than failing immediately.
 */
export function openDatabase(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}
