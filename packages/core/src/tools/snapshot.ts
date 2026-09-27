import { promises as fs } from "node:fs";
import * as path from "node:path";

import type { ToolContext } from "./types";

/**
 * Pre-mutation snapshots (§8 "Undo"). Before `edit_file`/`write_file` change a
 * file, the tool snapshots its prior content so a later "Undo this turn" can
 * restore it. Snapshots live under
 * `<snapshotRoot>/<conversation>/<turn>/<counter>_<basename>.before`, with a
 * per-turn counter so successive mutations are ordered.
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

/** Next per-turn counter: one greater than the largest `N_…` prefix seen. */
async function nextCounter(dir: string): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return 1;
  }
  let max = 0;
  for (const entry of entries) {
    const match = /^(\d+)_/.exec(entry);
    if (match) {
      const n = Number(match[1]);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

/** Allocate the next snapshot path for `basename` inside the turn directory. */
async function nextSnapshotPath(
  dir: string,
  base: string,
  kind: SnapshotKind,
): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const counter = await nextCounter(dir);
  return path.join(dir, `${counter}_${base}.${kind}`);
}

/**
 * Record `absolutePath`'s state before a mutation. When the file exists its
 * current content is copied to a `.before` snapshot; when it does not exist a
 * zero-length `.created` marker is written so undo can remove it. Returns the
 * snapshot (or marker) path and the recorded kind.
 */
export async function snapshotFile(
  absolutePath: string,
  location: SnapshotLocation,
): Promise<SnapshotResult> {
  const dir = path.join(location.snapshotRoot, location.conversationId, location.turnId);
  const base = path.basename(absolutePath);

  let content: string | null;
  try {
    content = await fs.readFile(absolutePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") content = null;
    else throw err;
  }

  if (content === null) {
    const out = await nextSnapshotPath(dir, base, "created");
    await fs.writeFile(out, "", "utf8");
    return { path: out, kind: "created" };
  }

  const out = await nextSnapshotPath(dir, base, "before");
  await fs.writeFile(out, content, "utf8");
  return { path: out, kind: "before" };
}

/**
 * Snapshot `absolutePath` before a mutation, using whatever mechanism the host
 * configured. A `ctx.snapshot` callback (host-injected) is invoked when
 * present; when `ctx.snapshotRoot` is present a file snapshot is also written
 * via {@link snapshotFile} (defaulting the conversation/turn segments) and its
 * result — including whether the file was created this turn — is returned.
 */
export async function snapshotBeforeMutation(
  ctx: ToolContext,
  absolutePath: string,
): Promise<SnapshotResult | undefined> {
  if (ctx.snapshot) await ctx.snapshot(absolutePath);
  if (!ctx.snapshotRoot) return undefined;
  return snapshotFile(absolutePath, {
    snapshotRoot: ctx.snapshotRoot,
    conversationId: ctx.conversationId ?? "default",
    turnId: ctx.turnId ?? "default",
  });
}
