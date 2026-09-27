import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type Database from "better-sqlite3";

/** Directory holding the numbered `.sql` migrations, relative to this file. */
export const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations", import.meta.url));

/** One applied migration, as recorded in the `schema_migrations` table. */
export interface MigrationRecord {
  name: string;
  appliedAt: number;
}

/**
 * Apply pending numbered migrations (`NNN_name.sql`) in filename order, each
 * inside its own transaction, and record them in `schema_migrations`. Returns
 * the names applied in this run (empty when the schema is already current).
 */
export async function runMigrations(
  db: Database.Database,
  migrationsDir: string = MIGRATIONS_DIR,
): Promise<string[]> {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at INTEGER NOT NULL
  )`);

  const files = (await readdir(migrationsDir))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();

  const appliedRows = db
    .prepare("SELECT name FROM schema_migrations")
    .all() as { name: string }[];
  const applied = new Set(appliedRows.map((row) => row.name));

  const appliedNow: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
        file,
        Date.now(),
      );
    })();
    appliedNow.push(file);
  }
  return appliedNow;
}

/** The migrations already recorded in `schema_migrations`, in apply order. */
export function listMigrations(db: Database.Database): MigrationRecord[] {
  const rows = db
    .prepare("SELECT name, applied_at FROM schema_migrations ORDER BY id")
    .all() as { name: string; applied_at: number }[];
  return rows.map((row) => ({ name: row.name, appliedAt: row.applied_at }));
}
