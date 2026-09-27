import { cn } from "../ui";
import type { ChatMessage } from "../../store/chatStore";

/**
 * One conversation message (§12.6, "Message list"): a user turn (right-aligned
 * elevated bubble) or an assistant turn (left-aligned, plain text that grows in
 * place as deltas stream). Tool-call and approval cards attach in feature 6.1.
 */
export function MessageItem({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <article className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <span className="mb-1 text-xs font-medium text-text-muted">
        {isUser ? "You" : "OpenArtifact"}
      </span>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words text-sm leading-normal",
          isUser
            ? "rounded-lg border border-border bg-bg-elevated px-3 py-2 text-text"
            : "text-text",
        )}
      >
        {message.content !== ""
          ? message.content
          : !isUser && <span className="text-text-muted">Working…</span>}
      </div>
    </article>
  );
}
