import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ApprovalRequestEvent } from "@openartifact/shared";

import { lineDiff, truncateText } from "../../lib/diff";
import { useChatStore } from "../../store/chatStore";
import { Button, cn, focusRing, StatusDot } from "../ui";

/** Longest a diff or file body is shown before truncation. */
const MAX_BODY_CHARS = 6000;

/** Read a string field from (possibly arbitrary) tool arguments. */
function readStringField(args: unknown, key: string): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Read a boolean field from the arguments (defaults to false). */
function readBoolField(args: unknown, key: string): boolean {
  if (typeof args !== "object" || args === null) return false;
  return (args as Record<string, unknown>)[key] === true;
}

/**
 * A pending approval (§12.6, "Approval cards"). Shows the exact, risky action
 * and asks for a decision:
 *
 * - `edit_file` / `write_file`: the target path and a line diff of the change.
 * - `execute_command`: the full command (editable) and its working directory.
 * - any other tool (e.g. a secret `read_file`): the arguments and the reason.
 *
 * The user can approve, edit the command before it runs, or reject with a note
 * that is returned to the model as the tool result.
 */
export function ApprovalCard({ approval }: { approval: ApprovalRequestEvent }) {
  const decide = useChatStore((state) => state.decide);

  const isCommand = approval.name === "execute_command";

  const originalCommand = readStringField(approval.args, "command") ?? "";
  const [command, setCommand] = useState(originalCommand);
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);

  const cwd = readStringField(approval.args, "cwd");

  const commandEdited = command !== originalCommand;

  const body = useMemo(() => renderToolBody(approval), [approval]);

  async function approve() {
    if (isCommand) {
      const edited = command.trim();
      if (edited === "") return;
      setBusy(true);
      await decide(
        edited === originalCommand
          ? { kind: "approve" }
          : { kind: "edit-command", command: edited },
      );
    } else {
      setBusy(true);
      await decide({ kind: "approve" });
    }
  }

  async function reject() {
    setBusy(true);
    await decide({ kind: "reject", note });
  }

  return (
    <section
      aria-label={`Approve ${approval.name}`}
      className="w-full rounded-md border border-border bg-bg-elevated"
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <StatusDot tone="warning" />
        <h3 className="text-xs font-semibold text-text">Approval needed</h3>
        <span className="font-mono text-xs text-text-secondary">{approval.name}</span>
      </header>

      <div className="px-3 py-2">
        <p className="text-xs text-text-secondary">{approval.reason}</p>

        <div className="mt-2">{body}</div>

        {isCommand && (
          <div className="mt-2 flex flex-col gap-1">
            <label htmlFor="approval-command" className="text-xs font-medium text-text-muted">
              Command
            </label>
            <textarea
              id="approval-command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              rows={3}
              spellCheck={false}
              className={cn(
                "w-full resize-y rounded-md border border-border bg-bg-sunken px-3 py-1.5 font-mono text-xs leading-normal text-text",
                focusRing,
              )}
            />
            <p className="text-xs text-text-muted">
              Working directory:{" "}
              <span className="font-mono text-text-secondary">{cwd ?? "workspace root"}</span>
            </p>
          </div>
        )}

        {rejecting && (
          <div className="mt-2 flex flex-col gap-1">
            <label htmlFor="approval-note" className="text-xs font-medium text-text-muted">
              Rejection note
            </label>
            <textarea
              id="approval-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Returned to OpenArtifact as the tool result (optional)"
              className={cn(
                "w-full resize-y rounded-md border border-border bg-bg-sunken px-3 py-1.5 text-sm leading-normal text-text placeholder:text-text-muted",
                focusRing,
              )}
            />
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-border px-3 py-2">
        {rejecting ? (
          <>
            <Button variant="danger" size="sm" loading={busy} onClick={reject}>
              Send rejection
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setRejecting(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              disabled={isCommand && command.trim() === ""}
              onClick={approve}
            >
              {isCommand && commandEdited ? "Run edited command" : "Approve"}
            </Button>
            <Button variant="danger" size="sm" disabled={busy} onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </>
        )}
      </footer>
    </section>
  );
}

/** Render the tool-specific body (diff / file / arguments). */
function renderToolBody(approval: ApprovalRequestEvent): ReactNode {
  const { args } = approval;
  const path = readStringField(args, "path");

  if (approval.name === "edit_file") {
    const oldString = readStringField(args, "oldString") ?? "";
    const newString = readStringField(args, "newString") ?? "";
    return (
      <DiffBlock
        path={path}
        note={readBoolField(args, "replaceAll") ? "Replaces every occurrence." : undefined}
        oldText={oldString}
        newText={newString}
      />
    );
  }

  if (approval.name === "write_file") {
    const content = readStringField(args, "content") ?? "";
    const body = truncateText(content, MAX_BODY_CHARS);
    return (
      <div>
        {path !== undefined && (
          <p className="mb-1 text-xs text-text-muted">
            Writes <span className="font-mono text-text-secondary">{path}</span>
          </p>
        )}
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-normal text-text-secondary">
          {body.text}
        </pre>
        {body.truncated && <p className="mt-1 text-xs text-text-muted">File content truncated.</p>}
      </div>
    );
  }

  // Secret reads and any other forced-approval tool: show the arguments plainly.
  const raw = JSON.stringify(args, null, 2);
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-normal text-text-secondary">
      {raw}
    </pre>
  );
}

/** A line diff (feature 6.1) with the target path above it. */
function DiffBlock({
  path,
  note,
  oldText,
  newText,
}: {
  path?: string;
  note?: string;
  oldText: string;
  newText: string;
}) {
  const diff = useMemo(() => lineDiff(oldText, newText), [oldText, newText]);
  return (
    <div>
      {path !== undefined && (
        <p className="mb-1 text-xs text-text-muted">
          Edits <span className="font-mono text-text-secondary">{path}</span>
        </p>
      )}
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border bg-bg-sunken px-3 py-2 font-mono text-xs leading-normal">
        {diff.map((line, index) => (
          <span
            key={index}
            className={cn(
              "block",
              line.type === "added" && "text-success",
              line.type === "removed" && "text-danger",
              line.type === "context" && "text-text-muted",
            )}
          >
            {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
            {line.text}
          </span>
        ))}
      </pre>
      {note !== undefined && <p className="mt-1 text-xs text-text-muted">{note}</p>}
    </div>
  );
}
