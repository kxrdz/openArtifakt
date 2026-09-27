import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { FAKE_NOTES_CONTENT, FAKE_NOTES_FILE } from "./fixture";

/**
 * Seeded temporary workspace for fake-provider mode (§12.6).
 *
 * Creates a real `mkdtemp` directory seeded with `notes.txt` so the scripted
 * `edit_file` has a genuine target and the scripted `execute_command` has a
 * real file to read. The caller owns cleanup via {@link FakeWorkspace.cleanup}.
 */

export interface FakeWorkspace {
  /** Absolute path to the seeded workspace root. */
  root: string;
  /** Absolute path to the seeded `notes.txt`. */
  notesPath: string;
  /** Remove the workspace and everything in it. */
  cleanup: () => Promise<void>;
}

/** Create a seeded temp workspace for the fake provider. */
export async function createFakeWorkspace(
  prefix = "openartifact-fake-",
): Promise<FakeWorkspace> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  const notesPath = path.join(root, FAKE_NOTES_FILE);
  await writeFile(notesPath, FAKE_NOTES_CONTENT);
  return {
    root,
    notesPath,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
