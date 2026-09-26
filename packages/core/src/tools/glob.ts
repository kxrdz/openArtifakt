import * as path from "node:path";
import { z } from "zod";

import { resolveWithinWorkspace } from "../security/path-jail";
import { escapeRegex, readdirSorted, toPosixPath } from "./fs";
import { truncateResult } from "./truncate";
import { defineTool } from "./types";

const MAX_MATCHES = 500;

/**
 * Convert a glob pattern (`*`, `**`, `?`) into an anchored regex over a
 * forward-slash relative path. `*` and `?` do not cross `/`; `**` matches any
 * number of characters including `/`, and a `**` followed by `/` matches zero
 * or more directory levels.
 */
export function globToRegExp(pattern: string): RegExp {
  let source = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === "*") {
      let j = i;
      while (j < pattern.length && pattern[j] === "*") j += 1;
      const stars = j - i;
      if (stars >= 2) {
        if (j < pattern.length && pattern[j] === "/") {
          source += "(?:[^/]+/)*";
          i = j + 1;
          continue;
        }
        source += ".*";
        i = j;
        continue;
      }
      source += "[^/]*";
      i = j;
    } else if (c === "?") {
      source += "[^/]";
      i += 1;
    } else {
      source += escapeRegex(c);
      i += 1;
    }
  }
  return new RegExp(`^${source}$`);
}

/** The literal directory prefix of `pattern` (up to the last `/` before any glob char). */
function staticPrefix(pattern: string): string {
  const firstGlob = pattern.search(/[*?[]/);
  if (firstGlob === -1) return pattern;
  const slash = pattern.slice(0, firstGlob).lastIndexOf("/");
  return slash === -1 ? "" : pattern.slice(0, slash + 1);
}

/** Walk `dir` collecting files (relative to `workspaceRoot`) matching `regex`. */
async function collectMatches(
  dir: string,
  workspaceRoot: string,
  regex: RegExp,
  matches: string[],
  max: number,
): Promise<boolean> {
  let entries;
  try {
    entries = await readdirSorted(dir);
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (matches.length >= max) return true;
    if (entry.isSymbolicLink) continue; // never follow symlinks

    const abs = path.join(dir, entry.name);
    if (entry.isDirectory) {
      if (entry.name === ".git") continue;
      if (await collectMatches(abs, workspaceRoot, regex, matches, max)) return true;
    } else {
      const rel = toPosixPath(path.relative(workspaceRoot, abs));
      if (regex.test(rel)) matches.push(rel);
    }
  }
  return false;
}

/**
 * `glob` (§8). Finds files matching a glob pattern (`*`, `**`, `?`) relative
 * to the workspace root. Returns matching relative paths, one per line, capped
 * at {@link MAX_MATCHES}. Symlinks are not followed and `.git/` is skipped.
 */
export const globTool = defineTool({
  name: "glob",
  description:
    "Find files in the workspace by a glob pattern relative to the workspace root. " +
    "Supports `*` (no `/`), `**` (crosses `/`) and `?` (one non-`/` character).",
  parameters: z.object({
    pattern: z.string().min(1).describe("Glob pattern, e.g. src/**/*.ts"),
  }),
  approval: "read",
  async execute(args, ctx) {
    try {
      const pattern = toPosixPath(args.pattern);
      const regex = globToRegExp(pattern);
      const prefix = staticPrefix(pattern);

      // Walk from the literal prefix (or the root) to bound the search.
      const walkRootRel = prefix === "" ? "." : prefix.replace(/\/$/, "");
      const walkRoot = await resolveWithinWorkspace(ctx.workspaceRoot, walkRootRel || ".");

      const matches: string[] = [];
      const capped = await collectMatches(walkRoot, ctx.workspaceRoot, regex, matches, MAX_MATCHES);
      matches.sort();

      const body = matches.join("\n");
      const content =
        body === ""
          ? "(no matches)"
          : capped
            ? `${body}\n... (capped at ${MAX_MATCHES} matches)`
            : body;

      return truncateResult({ content });
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
});
