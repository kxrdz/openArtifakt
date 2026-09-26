import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { z } from "zod";

import { resolveWorkspaceRoot } from "../security/path-jail";
import { readdirSorted, toPosixPath } from "./fs";
import { GitignoreMatcher, loadGitignore } from "./gitignore";
import { globToRegExp } from "./glob";
import { truncateResult } from "./truncate";
import { defineTool } from "./types";

const SEARCH_RESULT_CAP = 100;

export interface SearchMatch {
  file: string;
  line: number;
  text: string;
}

/** Stable sort: by file, then by line number. */
function compareMatches(a: SearchMatch, b: SearchMatch): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return a.line - b.line;
}

/** Format matches as grep-like `file:line: text` lines plus a summary. */
export function formatMatches(matches: SearchMatch[], capped: boolean): string {
  const body = matches.map((m) => `${m.file}:${m.line}:${m.text}`).join("\n");
  const files = new Set(matches.map((m) => m.file)).size;
  const summary = `${matches.length} ${matches.length === 1 ? "match" : "matches"} in ${files} ${files === 1 ? "file" : "files"}`;
  const lines = body === "" ? [summary] : [body, summary];
  if (capped) lines.push(`... (results capped at ${SEARCH_RESULT_CAP} matches)`);
  return lines.join("\n");
}

/** Parse ripgrep `--json` output into matches. */
export function parseRgJson(stdout: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  for (const line of stdout.split("\n")) {
    if (line === "") continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const record = obj as {
      type?: string;
      data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } };
    };
    if (record.type !== "match") continue;
    const file = record.data?.path?.text;
    const lineNumber = record.data?.line_number;
    const text = record.data?.lines?.text ?? "";
    if (typeof file === "string" && typeof lineNumber === "number") {
      matches.push({ file, line: lineNumber, text: text.replace(/\n$/, "") });
    }
  }
  return matches;
}

/** Run ripgrep, returning its stdout and exit code (0 matches, 1 none, 2 error). */
function runRipgrep(
  rgPath: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(rgPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const onAbort = (): void => {
      child.kill("SIGKILL");
    };
    signal.addEventListener("abort", onAbort, { once: true });
    child.on("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

interface JsSearchResult {
  matches: SearchMatch[];
  capped: boolean;
}

/** Recursively walk `dir`, matching `pattern` against file lines (JS fallback). */
async function walkSearch(
  dir: string,
  scopeRel: string,
  matcher: GitignoreMatcher,
  pattern: RegExp,
  glob: RegExp | undefined,
  signal: AbortSignal,
  cap: number,
  result: JsSearchResult,
): Promise<boolean> {
  const lines = await loadGitignore(dir);
  if (lines.length > 0) matcher.addScope(scopeRel, lines);

  let entries;
  try {
    entries = await readdirSorted(dir);
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (signal.aborted) throw new Error("cancelled by user");
    if (result.matches.length >= cap) {
      result.capped = true;
      return true;
    }
    if (entry.isSymbolicLink) continue;

    const rel = scopeRel === "" ? entry.name : `${scopeRel}/${entry.name}`;
    if (entry.isDirectory) {
      if (entry.name === ".git") continue;
      if (matcher.isIgnored(rel, true)) continue;
      if (await walkSearch(path.join(dir, entry.name), rel, matcher, pattern, glob, signal, cap, result)) {
        return true;
      }
      continue;
    }

    if (matcher.isIgnored(rel, false)) continue;
    if (glob && !glob.test(toPosixPath(rel))) continue;

    let content: string;
    try {
      content = await fs.readFile(path.join(dir, entry.name), "utf8");
    } catch {
      continue; // binary or unreadable
    }

    const fileLines = content.split("\n");
    for (let i = 0; i < fileLines.length; i += 1) {
      const text = fileLines[i]!;
      if (pattern.test(text)) {
        result.matches.push({ file: toPosixPath(rel), line: i + 1, text });
        if (result.matches.length >= cap) {
          result.capped = true;
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * `search_code` (§8). Regex search across workspace files. Uses ripgrep when a
 * binary path is provided via `ctx.findRipgrep()`, otherwise falls back to a
 * JS walk. Both respect `.gitignore`, skip `.git/`, and cap results.
 */
export const searchCodeTool = defineTool({
  name: "search_code",
  description:
    "Search file contents in the workspace by a regular expression. Returns matching files and " +
    "lines, capped at the result limit. Optionally restrict files with a glob pattern.",
  parameters: z.object({
    pattern: z.string().min(1).describe("Regular expression to search for"),
    glob: z.string().optional().describe("Optional glob to restrict which files are searched"),
  }),
  approval: "read",
  async execute(args, ctx) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(args.pattern);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { content: `Invalid regular expression "${args.pattern}": ${reason}`, isError: true };
    }

    try {
      const rgPath = ctx.findRipgrep ? await ctx.findRipgrep().catch(() => undefined) : undefined;
      if (rgPath) {
        try {
          const globArgs = args.glob ? ["-g", args.glob] : [];
          const { stdout, stderr, exitCode } = await runRipgrep(
            rgPath,
            ["--json", "--hidden", args.pattern, ...globArgs],
            ctx.workspaceRoot,
            ctx.signal,
          );
          if (exitCode === 2) {
            return { content: `ripgrep failed: ${stderr.trim() || "exit code 2"}`, isError: true };
          }
          const matches = parseRgJson(stdout);
          const capped = matches.length >= SEARCH_RESULT_CAP;
          matches.sort(compareMatches);
          return truncateResult({
            content: formatMatches(matches.slice(0, SEARCH_RESULT_CAP), capped),
          });
        } catch {
          // rg unavailable or failed to spawn — fall through to the JS walk.
        }
      }

      const root = await resolveWorkspaceRoot(ctx.workspaceRoot);
      const matcher = new GitignoreMatcher();
      const glob = args.glob ? globToRegExp(toPosixPath(args.glob)) : undefined;
      const result: JsSearchResult = { matches: [], capped: false };
      await walkSearch(root, "", matcher, pattern, glob, ctx.signal, SEARCH_RESULT_CAP, result);
      result.matches.sort(compareMatches);
      return truncateResult({ content: formatMatches(result.matches, result.capped) });
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
});
