import type { ChatMessage } from "../../store/chatStore";
import { useChatStore } from "../../store/chatStore";
import { ToolCallCard } from "./ToolCallCard";
import { ApprovalCard } from "./ApprovalCard";

/**
 * One conversation message (§12.6, "Message list"): a user turn (right-aligned
 * elevated bubble) or an assistant turn (left-aligned, plain text that grows in
 * place as deltas stream). An assistant turn also carries its tool-call cards
 * and, while one is paused, the matching approval card.
 */
export function MessageItem({ message }: { message: ChatMessage }) {
  const pendingApproval = useChatStore((state) => state.pendingApproval);
  const isUser = message.role === "user";

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
      <div className="w-full max-w-[85%] whitespace-pre-wrap break-words text-sm leading-normal text-text">
        {message.content !== "" ? message.content : <span className="text-text-muted">Working…</span>}
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
    </article>
  );
}
