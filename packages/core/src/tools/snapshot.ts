import { promises as fs, type Dirent } from "node:fs";
import * as path from "node:path";

import type { ToolContext } from "./types";

/**
 * Pre-mutation snapshots (§8 "Undo"). Before `edit_file`/`write_file` change a
 * file, the tool snapshots its prior content so a later "Undo this turn" can
 * restore it. Snapshots live under
 * `<snapshotRoot>/<conversation>/<turn>/<relDir>/<counter>_<basename>.<kind>`,
 * where `<relDir>` is the file's workspace-relative directory (preserved so
 * undo can restore a file to its exact location, not just its basename) and
 * `<counter>` is a per-turn counter so successive mutations are ordered.
 *
 * Files a turn *creates* cannot have prior content, so the snapshot store
 * records a zero-length `<counter>_<basename>.created` marker instead; undo
 * deletes those targets rather than restoring them.
 */

export interface SnapshotLocation {
  /** Absolute root for snapshot storage (e.g. `~/.openartifact/snapshots`). */
  snapshotRoot: string;
  /** Conversation id segment of the snapshot path. */
  conversationId: string;
  /** Turn id segment of the snapshot path. */
  turnId: string;
}

/** Whether a snapshot stored the file's prior content or marked it as created. */
export type SnapshotKind = "before" | "created";

/** Result of recording one snapshot: where, and of what kind. */
export interface SnapshotResult {
  /** Absolute path of the `.before` copy or the `.created` marker. */
  path: string;
  /** `before` (file existed; prior content stored) or `created` (file did not exist). */
  kind: SnapshotKind;
}

/** What {@link restoreTurnSnapshots} did, for reporting back to a caller. */
export interface UndoResult {
  /** Workspace-relative paths restored from a `.before` snapshot. */
  restored: string[];
  /** Workspace-relative paths deleted because the turn created them. */
  deleted: string[];
}

/** Next per-turn counter: one greater than the largest `N_…` prefix seen. */
async function nextCounter(turnDir: string): Promise<number> {
  let max = 0;
  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name));
        continue;
      }
      const match = /^(\d+)_/.exec(entry.name);
      if (match !== null) max = Math.max(max, Number(match[1]));
    }
  };
  await walk(turnDir);
  return max + 1;
}

/**
 * Record `absolutePath`'s state before a mutation. When the file exists its
 * current content is copied to a `.before` snapshot; when it does not exist a
 * zero-length `.created` marker is written so undo can remove it. `relativePath`
 * is the file's workspace-relative path (defaults to the basename for callers
 * that only have an absolute path) and determines the snapshot's directory.
 * Returns the snapshot (or marker) path and the recorded kind.
 */
export async function snapshotFile(
  absolutePath: string,
  location: SnapshotLocation,
  relativePath: string = path.basename(absolutePath),
): Promise<SnapshotResult> {
  const turnDir = path.join(location.snapshotRoot, location.conversationId, location.turnId);
  const base = path.basename(relativePath);
  const relDir = path.dirname(relativePath);

  let content: string | null;
  try {
    content = await fs.readFile(absolutePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") content = null;
    else throw err;
  }

  const kind: SnapshotKind = content === null ? "created" : "before";
  const counter = await nextCounter(turnDir);
  const dir = relDir === "." ? turnDir : path.join(turnDir, relDir);
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, `${counter}_${base}.${kind}`);
  await fs.writeFile(out, content ?? "", "utf8");
  return { path: out, kind };
}

/**
 * Snapshot `absolutePath` before a mutation, using whatever mechanism the host
 * configured. A `ctx.snapshot` callback (host-injected) is invoked when
 * present; when `ctx.snapshotRoot` is present a file snapshot is also written
 * via {@link snapshotFile} (defaulting the conversation/turn segments), with
 * the file's workspace-relative path preserved, and its result — including
 * whether the file was created this turn — is returned.
 */
export async function snapshotBeforeMutation(
  ctx: ToolContext,
  absolutePath: string,
): Promise<SnapshotResult | undefined> {
  if (ctx.snapshot) await ctx.snapshot(absolutePath);
  if (!ctx.snapshotRoot) return undefined;
  const relativePath = path.relative(ctx.workspaceRoot, absolutePath);
  const safe =
    relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)
      ? path.basename(absolutePath)
      : relativePath;
  return snapshotFile(
    absolutePath,
    {
      snapshotRoot: ctx.snapshotRoot,
      conversationId: ctx.conversationId ?? "default",
      turnId: ctx.turnId ?? "default",
    },
    safe,
  );
}

/** One snapshot file found under a turn directory. */
interface SnapshotEntry {
  counter: number;
  kind: SnapshotKind;
  /** Absolute path of the snapshot file. */
  path: string;
  /** Workspace-relative target path (counter prefix and kind suffix stripped). */
  relPath: string;
}

/** A snapshot file name: `<counter>_<basename>.<before|created>`. */
const SNAPSHOT_NAME = /^(\d+)_(.+)\.(before|created)$/;

/** Recursively collect the snapshot files under a turn directory. */
async function collectSnapshots(turnDir: string): Promise<SnapshotEntry[]> {
  const entries: SnapshotEntry[] = [];
  const walk = async (dir: string): Promise<void> => {
    let dirents: Dirent[];
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of dirents) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      const match = SNAPSHOT_NAME.exec(entry.name);
      if (match === null) continue;
      const relDir = path.relative(turnDir, dir);
      const base = match[2]!;
      entries.push({
        counter: Number(match[1]),
        kind: match[3] as SnapshotKind,
        path: full,
        relPath: relDir === "" ? base : path.join(relDir, base),
      });
    }
  };
  await walk(turnDir);
  return entries;
}

/**
 * Restore one completed turn's snapshots (§8 "Undo").
 *
 * Walks `<snapshotRoot>/<conversation>/<turn>/`, applies every snapshot in
 * reverse counter order — `.before` copies are written back to the workspace
 * and `.created` targets are deleted (so the last write for a given file is
 * its earliest, pre-turn snapshot) — then removes the turn's snapshot
 * directory. Returns the workspace-relative paths restored and deleted.
 */
export async function restoreTurnSnapshots(
  location: SnapshotLocation,
  workspaceRoot: string,
): Promise<UndoResult> {
  const turnDir = path.join(location.snapshotRoot, location.conversationId, location.turnId);
  const entries = await collectSnapshots(turnDir);
  entries.sort((a, b) => b.counter - a.counter);

  const restored = new Set<string>();
  const deleted = new Set<string>();
  for (const entry of entries) {
    const target = path.join(workspaceRoot, entry.relPath);
    // Guard against a corrupt snapshot directory escaping the workspace.
    const rel = path.relative(workspaceRoot, target);
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue;

    if (entry.kind === "before") {
      const content = await fs.readFile(entry.path, "utf8");
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf8");
      restored.add(entry.relPath);
    } else {
      await fs.rm(target, { force: true });
      deleted.add(entry.relPath);
    }
  }

  await fs.rm(turnDir, { recursive: true, force: true });
  return { restored: [...restored], deleted: [...deleted] };
}
