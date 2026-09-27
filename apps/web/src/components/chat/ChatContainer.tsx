import { useLayoutEffect, useRef, useState } from "react";
import type { UIEvent } from "react";

import { useChatStore } from "../../store/chatStore";
import { MessageItem } from "./MessageItem";

/** Distance from the bottom (px) below which the list counts as pinned. */
const BOTTOM_THRESHOLD = 40;

/**
 * The scrollable conversation list (§12.6, "Message list"). Renders every
 * message and auto-scrolls to the newest content as it streams — pausing while
 * the user has scrolled up, and resuming when they return to the bottom. A new
 * user turn re-pins the view.
 */
export function ChatContainer() {
  const messages = useChatStore((state) => state.messages);
  const isSending = useChatStore((state) => state.isSending);
  const listRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      BOTTOM_THRESHOLD;
    if (atBottom !== pinned) setPinned(atBottom);
  }

  // Scroll synchronously before paint so streamed text never causes a visible
  // jump. Depends on `messages` (identity changes on every delta) so growing
  // content keeps the bottom in view while pinned.
  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) return;

    const last = messages[messages.length - 1];
    if (last?.role === "user") {
      setPinned(true);
      element.scrollTop = element.scrollHeight;
      return;
    }

    if (pinned) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, pinned]);

  // Turns are numbered 1, 2, … per conversation (§8); each user message
  // opens a turn and its assistant message belongs to the same turn.
  const withTurns = (() => {
    let turn = 0;
    return messages.map((message) => {
      if (message.role === "user") turn += 1;
      return { message, turn };
    });
  })();

  return (
    <div
      ref={listRef}
      onScroll={onScroll}
      aria-label="Conversation"
      className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4"
    >
      {withTurns.map(({ message, turn }, index) => (
        <MessageItem
          key={message.id}
          message={message}
          turn={turn}
          inFlight={isSending && index === messages.length - 1}
        />
      ))}
    </div>
  );
}
