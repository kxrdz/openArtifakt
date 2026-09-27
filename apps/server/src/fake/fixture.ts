/**
 * Fixed fixture for fake-provider mode (§12.6, "Fake provider mode").
 *
 * The scripted conversation needs a real workspace target so the agent loop's
 * genuine `edit_file`/`execute_command` paths are exercised without any API
 * key or network. This module owns the seeded file and the exact tool-call
 * arguments the scripted turns reference; the server, the fake provider and
 * the tests all import from here so the edit target, command and seeded
 * content can never drift apart.
 */

/** The seeded workspace file the scripted edit targets. */
export const FAKE_NOTES_FILE = "notes.txt";

/** The exact substring the scripted `edit_file` call replaces (occurs once). */
export const FAKE_NOTES_ORIGINAL = "hello";

/** The seeded `notes.txt` content, before the scripted edit runs. */
export const FAKE_NOTES_CONTENT = `${FAKE_NOTES_ORIGINAL}\nOpenArtifact demo workspace\n`;

/** The scripted `edit_file` arguments (approval required in ask mode). */
export const FAKE_EDIT_ARGS = {
  path: FAKE_NOTES_FILE,
  oldString: FAKE_NOTES_ORIGINAL,
  newString: "hello, world",
} as const;

/**
 * The scripted `execute_command` command. It uses `node` (always present,
 * see `engines`) rather than `cat` so the fixture replays identically on
 * POSIX and Windows shells.
 */
export const FAKE_COMMAND = `node -e 'console.log(require("fs").readFileSync("notes.txt","utf8"))'`;

/** The scripted `execute_command` arguments (approval required in ask mode). */
export const FAKE_COMMAND_ARGS = {
  command: FAKE_COMMAND,
} as const;
