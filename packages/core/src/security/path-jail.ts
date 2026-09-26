import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * Workspace path jail (§9 "Path jail").
 *
 * Every tool that touches the filesystem resolves its target through
 * {@link resolveWithinWorkspace}, which realpaths both the workspace root and
 * the candidate so that `..` traversal *and* symlink escapes are rejected,
 * then {@link assertWritablePath} for mutations, which additionally denies
 * writes anywhere inside `.git/`.
 */

export type PathJailErrorCode = "outside-workspace" | "inside-git";

/** Thrown when a path escapes the workspace jail. */
export class PathJailError extends Error {
  readonly code: PathJailErrorCode;

  constructor(message: string, code: PathJailErrorCode = "outside-workspace") {
    super(message);
    this.name = "PathJailError";
    this.code = code;
  }
}

/**
 * True when `target` is `root` itself or a descendant of `root`. Both
 * arguments must be absolute, realpath'd paths.
 */
export function isWithin(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Resolve the workspace root to its real absolute path. */
export async function resolveWorkspaceRoot(workspaceRoot: string): Promise<string> {
  const absolute = path.resolve(workspaceRoot);
  try {
    return await fs.realpath(absolute);
  } catch {
    throw new PathJailError(`Workspace root does not exist: ${workspaceRoot}`);
  }
}

/**
 * Realpath `p`, treating missing trailing components as literal (no symlinks
 * can exist there yet). This lets `write_file` validate a not-yet-created
 * target while still resolving any symlinks in the existing ancestor chain.
 */
async function realpathExistingPrefix(p: string, missing: string[] = []): Promise<string> {
  try {
    const real = await fs.realpath(p);
    return missing.length === 0 ? real : path.join(real, ...missing);
  } catch {
    const parent = path.dirname(p);
    if (parent === p) return p;
    return realpathExistingPrefix(parent, [path.basename(p), ...missing]);
  }
}

/**
 * Resolve `userPath` (relative to the workspace root; absolute paths are
 * treated as-is) to its real path and reject anything that escapes the
 * workspace, including `..` traversal and symlink escapes.
 */
export async function resolveWithinWorkspace(
  workspaceRoot: string,
  userPath: string,
): Promise<string> {
  const realRoot = await resolveWorkspaceRoot(workspaceRoot);
  const absolute = path.resolve(realRoot, userPath);
  const realTarget = await realpathExistingPrefix(absolute);

  if (!isWithin(realRoot, realTarget)) {
    throw new PathJailError(`Path "${userPath}" resolves outside the workspace`);
  }
  return realTarget;
}

/**
 * Deny writes inside `.git/`. `realRoot` and `realTarget` must be realpath'd
 * absolute paths (as returned by `resolveWorkspaceRoot`/`resolveWithinWorkspace`).
 */
export function assertWritablePath(realRoot: string, realTarget: string): void {
  const gitDir = path.join(realRoot, ".git");
  if (isWithin(gitDir, realTarget)) {
    throw new PathJailError(`Refusing to write inside ${gitDir}`, "inside-git");
  }
}
