import type { MutableRefObject } from "react";

import { useChatStore } from "../../store/chatStore";
import { ChatContainer } from "../chat/ChatContainer";
import { Composer } from "../chat/Composer";
import type { ComposerHandle } from "../chat/Composer";
import { Button, MessageSquareIcon, PanelRightIcon } from "../ui";
import { TerminalLog } from "./TerminalLog";

export interface ChatPaneProps {
  /**
   * Narrow screens only: opens the artifact panel as a full-screen sheet.
   * Omitted on desktop where the panel is always visible beside the chat.
   */
  onOpenPanel?: () => void;
  /** Populated by the composer so the shell's global commands reach it. */
  composerHandleRef?: MutableRefObject<ComposerHandle | null>;
  /** Whether the terminal log body is expanded (owned by the shell). */
  terminalOpen: boolean;
  /** Toggles the terminal log body (`Mod+J`). */
  onToggleTerminal: () => void;
}

/**
 * The chat pane — the conversation (empty state before the first message, the
 * streaming message list after), the composer, and the collapsible terminal log
 * at its foot. Wired to the chat store so a conversation renders and streams.
 */
export function ChatPane({
  onOpenPanel,
  composerHandleRef,
  terminalOpen,
  onToggleTerminal,
}: ChatPaneProps) {
  const hasMessages = useChatStore((state) => state.messages.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasMessages ? (
        <ChatContainer />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-bg-elevated text-text-muted">
            <MessageSquareIcon className="h-5 w-5" />
          </span>
          <h2 className="text-md font-semibold text-text">No conversation yet</h2>
          <p className="max-w-sm text-sm text-text-secondary">
            Ask OpenArtifact to read, edit and run code in your project. Reads
            run automatically; edits and commands ask before they run.
          </p>
          {onOpenPanel && (
            <Button
              variant="secondary"
              size="sm"
              icon={<PanelRightIcon className="h-4 w-4" />}
              onClick={onOpenPanel}
            >
              Open artifact panel
            </Button>
          )}
        </div>
      )}
      <Composer handleRef={composerHandleRef} />
      <TerminalLog open={terminalOpen} onToggle={onToggleTerminal} />
    </div>
  );
}
