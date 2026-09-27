import { useMemo, useState } from "react";

import { parseDocument } from "../../artifacts";
import type { ParsedBlock } from "../../artifacts";
import { describeUndo, turnChangedFiles } from "../../lib/undo";
import type { ChatMessage } from "../../store/chatStore";
import { useChatStore } from "../../store/chatStore";
import { Button, cn, UndoIcon } from "../ui";
import { ToolCallCard } from "./ToolCallCard";
import { ApprovalCard } from "./ApprovalCard";
import { InlineMermaid } from "./InlineMermaid";

/**
 * One conversation message (§12.6, "Message list"): a user turn (right-aligned
 * elevated bubble) or an assistant turn (left-aligned, plain text that grows in
 * place as deltas stream). Assistant content is parsed (§12.7): prose renders
 * as text, complete ```mermaid fences render as inline diagrams, still-open
 * fences stay literal, and `<artifact>` blocks are lifted out of the message
 * into the artifact panel. An assistant turn also carries its tool-call cards
 * and, while one is paused, the matching approval card.
 */

/** Render a parsed message block: prose, inline diagram, or a literal fence. */
function BlockView({ block }: { block: ParsedBlock }) {
  if (block.type === "text") {
    return <div className="whitespace-pre-wrap break-words">{block.text}</div>;
  }
  if (block.complete) {
    return <InlineMermaid source={block.source} />;
  }
  // A fence that is still open mid-stream stays literal until it closes.
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-secondary">
      {"```mermaid\n"}
      {block.source}
    </pre>
  );
}

export function MessageItem({
  message,
  turn,
  inFlight,
}: {
  message: ChatMessage;
  /** 1-based turn number (§8); the undo endpoint keys snapshots by it. */
  turn: number;
  /** True while this message is the turn currently being streamed. */
  inFlight: boolean;
}) {
  const pendingApproval = useChatStore((state) => state.pendingApproval);
  const undoTurn = useChatStore((state) => state.undoTurn);
  const [undoing, setUndoing] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [outcomeFailed, setOutcomeFailed] = useState(false);
  const isUser = message.role === "user";
  const blocks = useMemo(
    () => (isUser ? null : parseDocument(message.content).blocks),
    [isUser, message.content],
  );

  // A completed turn that changed files can be undone (§12.8, feature 9.1).
  const canUndo = !isUser && !inFlight && turnChangedFiles(message);

  async function handleUndo() {
    setUndoing(true);
    setOutcome(null);
    setOutcomeFailed(false);
    try {
      const result = await undoTurn(turn);
      setOutcome(describeUndo(result.restored, result.deleted));
    } catch (error) {
      setOutcome(error instanceof Error ? error.message : "Undo failed.");
      setOutcomeFailed(true);
    } finally {
      setUndoing(false);
    }
  }

  if (isUser) {
    return (
      <article className="flex flex-col items-end">
        <span className="mb-1 text-xs font-medium text-text-muted">You</span>
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm leading-normal text-text">
          {message.content}
        </div>
      </article>
    );
  }

  const approvalCallId = pendingApproval?.callId;

  return (
    <article className="flex w-full flex-col items-start">
      <span className="mb-1 text-xs font-medium text-text-muted">OpenArtifact</span>
      <div className="w-full max-w-[85%] text-sm leading-normal text-text">
        {message.content === "" ? (
          <span className="text-text-muted">Working…</span>
        ) : (
          (blocks ?? []).map((block, index) => <BlockView key={index} block={block} />)
        )}
      </div>

      {message.toolCalls.length > 0 && (
        <div className="mt-2 flex w-full flex-col gap-2">
          {message.toolCalls.map((toolCall) => (
            <div key={toolCall.callId} className="flex w-full flex-col gap-2">
              <ToolCallCard toolCall={toolCall} />
              {approvalCallId === toolCall.callId && pendingApproval !== null && (
                <ApprovalCard approval={pendingApproval} />
              )}
            </div>
          ))}
        </div>
      )}

      {canUndo && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            loading={undoing}
            icon={<UndoIcon className="h-3.5 w-3.5" />}
            onClick={handleUndo}
          >
            Undo this turn
          </Button>
          {outcome !== null && (
            <span
              role="status"
              className={cn(
                "text-xs",
                outcomeFailed ? "text-danger" : "text-text-secondary",
              )}
            >
              {outcome}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
