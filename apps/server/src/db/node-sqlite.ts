import { DatabaseSync } from "node:sqlite";

import type { SqliteConnection, SqliteStatement, SqliteValue } from "./connection";

/**
 * Adapt a `node:sqlite` database to the engine-agnostic
 * {@link SqliteConnection} interface. `node:sqlite` has no `db.transaction`
 * helper, so {@link SqliteConnection.transaction} is emulated with an explicit
 * `BEGIN`/`COMMIT`/`ROLLBACK`.
 */
export function wrapNodeSqlite(db: DatabaseSync): SqliteConnection {
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
      db.exec("BEGIN");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    close() {
      db.close();
    },
  };
}

/**
 * Open (creating if needed) a `node:sqlite` database at `path` and apply the
 * app pragmas: WAL journaling, foreign-key enforcement, and a busy timeout.
 */
export function openNodeSqliteConnection(path: string): SqliteConnection {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  return wrapNodeSqlite(db);
}
