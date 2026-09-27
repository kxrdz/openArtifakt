import Database from "better-sqlite3";

import type { SqliteConnection, SqliteStatement, SqliteValue } from "./connection";

/**
 * Adapt a `better-sqlite3` database to the engine-agnostic
 * {@link SqliteConnection} interface.
 */
export function wrapBetterSqlite3(db: Database.Database): SqliteConnection {
  return {
    exec(sql) {
      db.exec(sql);
    },
    prepare(sql): SqliteStatement {
      const statement = db.prepare(sql);
      return {
        run(...params: SqliteValue[]) {
          return statement.run(...params);
        },
        get(...params: SqliteValue[]) {
          return statement.get(...params);
        },
        all(...params: SqliteValue[]) {
          return statement.all(...params);
        },
      };
    },
    transaction(fn) {
      return db.transaction(fn)();
    },
    close() {
      db.close();
    },
  };
}

/**
 * Open (creating if needed) a `better-sqlite3` database at `path` and apply the
 * app pragmas: WAL journaling, foreign-key enforcement, and a busy timeout.
 */
export function openBetterSqlite3Connection(path: string): SqliteConnection {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return wrapBetterSqlite3(db);
}
