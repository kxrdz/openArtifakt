import type { ChatMessage, ToolCallState } from "../store/chatStore";

/**
 * "Undo this turn" eligibility and outcome helpers (§8, feature 9.1).
 *
 * Pure so the rules can be unit-tested without the store or a server. A turn
 * "changed files" when one of its executed tool calls mutated the workspace —
 * an `edit_file` or `write_file` that was not rejected and did not error.
 * These are exactly the calls the server snapshots for undo.
 */

/** Tools whose execution is snapshotted for undo (§8). */
const FILE_WRITE_TOOLS = new Set(["edit_file", "write_file"]);

/** True when one tool call mutated a workspace file and can be undone. */
export function toolMutatedFile(call: ToolCallState): boolean {
  if (!FILE_WRITE_TOOLS.has(call.name)) return false;
  if (call.decision?.kind === "reject") return false;
  if (call.isError === true) return false;
  return call.result !== undefined;
}

/** True when an assistant turn has at least one undoable file mutation. */
export function turnChangedFiles(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  return message.toolCalls.some(toolMutatedFile);
}

/**
 * The 1-based turn number of the most recent completed turn that changed
 * files and can be undone, or `null` when there is none. Turn numbering
 * matches the conversation renderer (each user message opens a new turn).
 */
export function lastUndoableTurn(messages: ChatMessage[]): number | null {
  let turn = 0;
  let last: number | null = null;
  for (const message of messages) {
    if (message.role === "user") {
      turn += 1;
    } else if (message.role === "assistant" && turnChangedFiles(message)) {
      last = turn;
    }
  }
  return last;
}

/** Fold a path list into one comma-separated, human-readable phrase. */
function list(paths: string[]): string {
  return paths.join(", ");
}

/**
 * A clear, single-line outcome for the undo result: which files were restored
 * and which created files were removed, or that there was nothing to do.
 */
export function describeUndo(restored: string[], deleted: string[]): string {
  const actions: string[] = [];
  if (restored.length > 0) actions.push(`restored ${list(restored)}`);
  if (deleted.length > 0) actions.push(`removed ${list(deleted)}`);
  if (actions.length === 0) return "No files were changed by this turn.";
  return `Undone — ${actions.join("; ")}.`;
}
