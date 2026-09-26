import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { ToolContext } from "./types";

/**
 * Temp-directory helper for tool tests. Each test creates a real workspace so
 * path-jail resolution, `.gitignore` matching and glob/search walks run against
 * an actual filesystem; `cleanupTempWorkspaces` removes everything afterwards.
 */

const tracked: string[] = [];

/** Create a temp workspace directory and register it for cleanup. */
export async function makeTempWorkspace(prefix = "oa-tools-"): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}

/** Remove every workspace created by {@link makeTempWorkspace}. */
export async function cleanupTempWorkspaces(): Promise<void> {
  await Promise.all(tracked.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
}

/** Write a file, creating parent directories as needed. */
export async function writeFile(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

/** Build a {@link ToolContext} for tool unit tests. */
export function makeContext(root: string, overrides: Partial<ToolContext> = {}): ToolContext {
  return { workspaceRoot: root, signal: new AbortController().signal, ...overrides };
}
