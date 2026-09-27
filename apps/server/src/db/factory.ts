import { runMigrations } from "./migrations";
import type { Repository } from "./repository";
import { SqliteRepository } from "./sqlite-repository";

/** The storage engine backing an opened repository. */
export type StorageEngine = "better-sqlite3" | "node:sqlite";

/** An opened repository plus the handle needed to close its connection. */
export interface OpenedRepository {
  repository: Repository;
  engine: StorageEngine;
  close(): void;
}

/**
 * Open and migrate the database at `path`, returning a {@link Repository}
 * backed by `better-sqlite3`, or — when that native module fails to load —
 * the built-in `node:sqlite` module (§11). Both engines are adapted to the same
 * {@link SqliteConnection} contract, so callers are indifferent to the choice.
 *
 * The engines are imported lazily inside `try`/`catch` so a native build
 * failure of `better-sqlite3` (or its absence) is caught here rather than at
 * module-load time.
 */
export async function openRepository(path: string): Promise<OpenedRepository> {
  try {
    const { openBetterSqlite3Connection } = await import("./better-sqlite3");
    const connection = openBetterSqlite3Connection(path);
    await runMigrations(connection);
    return {
      repository: new SqliteRepository(connection),
      engine: "better-sqlite3",
      close: () => connection.close(),
    };
  } catch {
    // §11: fall back to node:sqlite when the native module fails to build/load.
  }

  const { openNodeSqliteConnection } = await import("./node-sqlite");
  const connection = openNodeSqliteConnection(path);
  await runMigrations(connection);
  return {
    repository: new SqliteRepository(connection),
    engine: "node:sqlite",
    close: () => connection.close(),
  };
}
