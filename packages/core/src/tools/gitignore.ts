import { promises as fs } from "node:fs";
import * as path from "node:path";

import { escapeRegex } from "./fs";

/**
 * Minimal `.gitignore` matcher (§8 "List directory tool"). Supports the common
 * subset the agent relies on: blank/comment lines, `!` negation, trailing `/`
 * (directory-only), leading `/` (anchored), `*`, `**` and `?`. Patterns are
 * scoped to the directory that holds their `.gitignore`, and later (deeper)
 * rules override earlier ones — matching git's own precedence closely enough
 * for a coding agent's tree listing.
 */

export interface GitignoreRule {
  /** Directory the `.gitignore` lives in, relative to the workspace root (`""` for the root). */
  scope: string;
  regex: RegExp;
  negated: boolean;
  /** Pattern ended with `/`: matches only directories (and their contents). */
  dirOnly: boolean;
}

/** Compile one `.gitignore` line, or `null` for blank/comment lines. */
export function compileGitignoreLine(pattern: string): Omit<GitignoreRule, "scope"> | null {
  let p = pattern.replace(/\r$/, "");
  if (p === "" || p.startsWith("#")) return null;

  let negated = false;
  if (p.startsWith("!")) {
    negated = true;
    p = p.slice(1);
    if (p === "") return null;
  }

  let dirOnly = false;
  if (p.endsWith("/")) {
    dirOnly = true;
    p = p.slice(0, -1);
  }

  const anchored = p.startsWith("/");
  if (anchored) p = p.slice(1);
  if (p === "") return null;

  const hasSlash = p.includes("/");

  let source = "";
  let i = 0;
  while (i < p.length) {
    const c = p[i]!;
    if (c === "*") {
      let j = i;
      while (j < p.length && p[j] === "*") j += 1;
      const stars = j - i;
      if (stars >= 2) {
        if (j < p.length && p[j] === "/") {
          // `**/` matches zero or more directory levels.
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

  // A pattern with a `/` (or an explicit leading `/`) is anchored to the
  // `.gitignore` directory; otherwise it matches a basename at any depth.
  const body = anchored || hasSlash ? `^${source}` : `(?:^|.*/)${source}`;
  const full = dirOnly ? `${body}(?:/.*)?$` : `${body}$`;

  return { regex: new RegExp(full), negated, dirOnly };
}

/** `relPath` relative to `scope`, or `null` when it is outside the scope. */
function relativeToScope(relPath: string, scope: string): string | null {
  if (scope === "") return relPath;
  if (relPath === scope) return "";
  if (relPath.startsWith(`${scope}/`)) return relPath.slice(scope.length + 1);
  return null;
}

/**
 * Accumulates rules from `.gitignore` files at different directory depths.
 * Call {@link addScope} with each directory's rules as the walk descends.
 */
export class GitignoreMatcher {
  readonly #rules: GitignoreRule[] = [];

  addScope(scope: string, lines: string[]): void {
    for (const line of lines) {
      const compiled = compileGitignoreLine(line);
      if (compiled) this.#rules.push({ ...compiled, scope });
    }
  }

  /** True when `relPath` (relative to the workspace root) is ignored. */
  isIgnored(relPath: string, isDir: boolean): boolean {
    let ignored = false;
    for (const rule of this.#rules) {
      if (rule.dirOnly && !isDir) continue;
      const sub = relativeToScope(relPath, rule.scope);
      if (sub === null) continue;
      if (rule.regex.test(sub)) ignored = !rule.negated;
    }
    return ignored;
  }
}

/** Read a directory's `.gitignore` lines (empty when absent). */
export async function loadGitignore(dir: string): Promise<string[]> {
  try {
    const content = await fs.readFile(path.join(dir, ".gitignore"), "utf8");
    return content.split("\n");
  } catch {
    return [];
  }
}
