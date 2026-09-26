import { promises as fs } from "node:fs";
import * as path from "node:path";

import type { ToolContext } from "./types";

/**
 * Pre-mutation snapshots (§8 "Undo"). Before `edit_file`/`write_file` change a
 * file, the tool snapshots its prior content so a later "Undo this turn" can
 * restore it. The snapshot lives under
 * `<snapshotRoot>/<conversation>/<turn>/<counter>_<basename>.before`, with a
 * per-turn counter so successive mutations are ordered.
 */

export interface SnapshotLocation {
  /** Absolute root for snapshot storage (e.g. `~/.openartifact/snapshots`). */
  snapshotRoot: string;
  /** Conversation id segment of the snapshot path. */
  conversationId: string;
  /** Turn id segment of the snapshot path. */
  turnId: string;
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

/**
 * Copy `absolutePath`'s current content into the snapshot store. Returns the
 * written snapshot path, or `undefined` when the file does not exist yet
 * (there is nothing to snapshot).
 */
export async function snapshotFile(
  absolutePath: string,
  location: SnapshotLocation,
): Promise<string | undefined> {
  let content: string;
  try {
    content = await fs.readFile(absolutePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }

  const dir = path.join(location.snapshotRoot, location.conversationId, location.turnId);
  await fs.mkdir(dir, { recursive: true });
  const counter = await nextCounter(dir);
  const base = path.basename(absolutePath);
  const out = path.join(dir, `${counter}_${base}.before`);
  await fs.writeFile(out, content, "utf8");
  return out;
}

/**
 * Snapshot `absolutePath` before a mutation, using whatever mechanism the host
 * configured. A `ctx.snapshot` callback (host-injected) is invoked when
 * present; when `ctx.snapshotRoot` is present a file copy is also written via
 * {@link snapshotFile} (defaulting the conversation/turn segments).
 */
export async function snapshotBeforeMutation(
  ctx: ToolContext,
  absolutePath: string,
): Promise<void> {
  if (ctx.snapshot) await ctx.snapshot(absolutePath);
  if (ctx.snapshotRoot) {
    await snapshotFile(absolutePath, {
      snapshotRoot: ctx.snapshotRoot,
      conversationId: ctx.conversationId ?? "default",
      turnId: ctx.turnId ?? "default",
    });
  }
}
