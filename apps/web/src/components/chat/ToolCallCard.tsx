import { Badge, ChevronRightIcon, cn, StatusDot, type StatusTone } from "../ui";
import type { ToolCallStatus, ToolCallState } from "../../store/chatStore";
import { truncateText } from "../../lib/diff";

/** Longest a single tool argument/result block is shown before truncation. */
const MAX_BLOCK_CHARS = 4000;

const statusLabel: Record<ToolCallStatus, string> = {
  running: "Running",
  awaiting_approval: "Waiting for approval",
  done: "Done",
  error: "Error",
};

const statusTone: Record<ToolCallStatus, StatusTone> = {
  running: "running",
  awaiting_approval: "warning",
  done: "success",
  error: "danger",
};

/** One-line preview of a tool call's arguments for the collapsed card. */
function argsPreview(args: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(args);
  } catch {
    json = String(args);
  }
  const compact = json.replace(/\s+/g, " ").trim();
  return compact.length > 90 ? `${compact.slice(0, 90)}…` : compact;
}

/**
 * A tool call shown on an assistant message (§12.6, "Tool-call cards"): the
 * tool name, a scannable status, and (collapsibly) the arguments and result.
 * Running and waiting states are glanceable from the status marker; done and
 * error match the loop's result.
 */
export function ToolCallCard({ toolCall }: { toolCall: ToolCallState }) {
  const args = truncateText(prettyArgs(toolCall.args), MAX_BLOCK_CHARS);
  const result =
    toolCall.result === undefined ? null : truncateText(toolCall.result, MAX_BLOCK_CHARS);

  return (
    <details className="group rounded-md border border-border bg-bg-elevated">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs [&::-webkit-details-marker]:hidden">
        <StatusDot tone={statusTone[toolCall.status]} pulse={toolCall.status === "running"} />
        <span className="font-mono text-xs font-medium text-text">{toolCall.name}</span>
        <Badge tone={statusTone[toolCall.status]}>{statusLabel[toolCall.status]}</Badge>
        <span className="ml-2 min-w-0 flex-1 truncate font-mono text-xs text-text-muted">
          {argsPreview(toolCall.args)}
        </span>
        <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-text-muted transition-transform duration-fast ease-out group-open:rotate-90" />
      </summary>

      <div className="border-t border-border px-3 py-2">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-normal text-text-secondary">
          {args.text}
        </pre>
        {args.truncated && <p className="mt-1 text-xs text-text-muted">Arguments truncated.</p>}

        {result !== null && (
          <div className="mt-2 border-t border-border pt-2">
            <p className="mb-1 text-xs font-medium text-text-muted">Result</p>
            <pre
              className={cn(
                "whitespace-pre-wrap break-words font-mono text-xs leading-normal",
                toolCall.isError ? "text-danger" : "text-text-secondary",
              )}
            >
              {result.text}
            </pre>
            {result.truncated && <p className="mt-1 text-xs text-text-muted">Result truncated.</p>}
          </div>
        )}
      </div>
    </details>
  );
}

/** Serialize arguments as indented JSON for the expanded card. */
function prettyArgs(args: unknown): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}
