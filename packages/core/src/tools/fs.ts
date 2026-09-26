import { promises as fs } from "node:fs";

/**
 * Small filesystem helpers shared by the read tools (§8). Kept dependency-free
 * so the tool executors stay unit-testable against a real temp directory.
 */

/** Escape a literal string for interpolation inside a `RegExp` source. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
}

/**
 * Read a directory's entries with their types, sorted deterministically:
 * directories first, then files, each alphabetically by codepoint. Symlinks are
 * reported as such (never followed) so callers can avoid escaping the jail.
 */
export async function readdirSorted(dir: string): Promise<DirEntry[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const entries: DirEntry[] = dirents.map((d) => ({
    name: d.name,
    isDirectory: d.isDirectory(),
    isFile: d.isFile(),
    isSymbolicLink: d.isSymbolicLink(),
  }));
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });
  return entries;
}

/** Convert an OS path to forward-slash form (what glob and gitignore use). */
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Strip a leading `./` and trailing slashes from a relative path. */
export function normalizeRelPath(p: string): string {
  let out = p.replace(/\\/g, "/");
  while (out.startsWith("./")) out = out.slice(2);
  while (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}
