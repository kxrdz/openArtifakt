import { useEffect, useRef, useState } from "react";

import { useArtifactStore } from "../../artifacts";
import { loadConversations, restoreConversation } from "../../lib/history";
import { useChatStore } from "../../store/chatStore";
import { Button, cn, focusRing, HistoryIcon, IconButton, PlusIcon, Spinner } from "../ui";

/** A short, calm relative timestamp for a conversation's age. */
function relativeTime(createdAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(createdAt).toLocaleDateString();
}

/**
 * Conversation history menu (§12.8, "Restore on load").
 *
 * A status-bar control that loads the persisted conversation list on startup,
 * and on selection restores that conversation's messages, tool-call log and
 * artifact versions into the stores. "New" clears the live conversation (both
 * stores) without discarding the persisted list. Keyboard-operable, Escape
 * closes, and a click outside dismisses it.
 */
export function ConversationMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const conversations = useChatStore((state) => state.conversations);
  const historyStatus = useChatStore((state) => state.historyStatus);
  const activeConversationId = useChatStore((state) => state.conversationId);

  // Load the list once, on mount. Failure is non-fatal; the menu shows its state.
  useEffect(() => {
    void loadConversations().catch(() => {
      /* historyStatus already records the error */
    });
  }, []);

  // Dismiss on Escape or a click/pointer outside the menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function startNewConversation() {
    useChatStore.getState().reset();
    useArtifactStore.getState().clear();
    setOpen(false);
  }

  async function openConversation(id: string) {
    setOpen(false);
    try {
      await restoreConversation(id);
    } catch {
      /* historyStatus already records the error */
    }
  }

  const loading = historyStatus === "loading" && conversations.length === 0;

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        aria-label="Conversations"
        aria-haspopup="menu"
        aria-expanded={open}
        icon={<HistoryIcon className="h-4 w-4" />}
        onClick={() => setOpen((value) => !value)}
      />

      {open && (
        <div
          role="menu"
          aria-label="Conversations"
          className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-bg-elevated shadow-2"
        >
          <div className="flex h-11 items-center justify-between border-b border-border px-2 pl-3">
            <span className="text-xs font-semibold text-text-secondary">Conversations</span>
            <Button
              size="sm"
              variant="ghost"
              icon={<PlusIcon className="h-3.5 w-3.5" />}
              onClick={startNewConversation}
            >
              New
            </Button>
          </div>

          <div className="max-h-80 overflow-y-auto p-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-text-muted">
                <Spinner size="sm" />
                Loading
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-text-muted">
                No conversations yet
              </p>
            ) : (
              conversations.map((conversation) => {
                const active = conversation.id === activeConversationId;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    role="menuitem"
                    onClick={() => void openConversation(conversation.id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors duration-fast",
                      focusRing,
                      active ? "bg-bg-hover" : "hover:bg-bg-hover",
                    )}
                  >
                    <span
                      className={cn(
                        "w-full truncate text-sm",
                        active ? "text-text" : "text-text-secondary",
                      )}
                    >
                      {conversation.title}
                    </span>
                    <span className="text-xs text-text-muted">
                      {relativeTime(conversation.createdAt)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
