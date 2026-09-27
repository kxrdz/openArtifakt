import type { MutableRefObject } from "react";

import { useChatStore } from "../../store/chatStore";
import { ChatContainer } from "../chat/ChatContainer";
import { Composer } from "../chat/Composer";
import type { ComposerHandle } from "../chat/Composer";
import { Button, MessageSquareIcon, PanelRightIcon, SettingsIcon } from "../ui";
import { TerminalLog } from "./TerminalLog";

export interface ChatPaneProps {
  /**
   * Narrow screens only: opens the artifact panel as a full-screen sheet.
   * Omitted on desktop where the panel is always visible beside the chat.
   */
  onOpenPanel?: () => void;
  /** Opens the settings drawer (the no-provider empty state's next action). */
  onOpenSettings?: () => void;
  /** Populated by the composer so the shell's global commands reach it. */
  composerHandleRef?: MutableRefObject<ComposerHandle | null>;
  /** Whether the terminal log body is expanded (owned by the shell). */
  terminalOpen: boolean;
  /** Toggles the terminal log body (`Mod+J`). */
  onToggleTerminal: () => void;
  /** Whether the configured provider is ready to run (`null` = unknown). */
  providerReady?: boolean | null;
  /** The workspace root the agent works in, shown on first run (not secret). */
  workspaceRoot?: string | null;
}

/**
 * The chat pane — the conversation (empty state before the first message, the
 * streaming message list after), the composer, and the collapsible terminal log
 * at its foot. Wired to the chat store so a conversation renders and streams.
 *
 * Before the first message the pane shows one of two onboard states: a
 * no-provider card with a path into settings when the server reports the
 * provider as not ready, otherwise a calm first-run hint that names what will
 * appear here (messages, approvals, terminal output) and the next action.
 */
export function ChatPane({
  onOpenPanel,
  onOpenSettings,
  composerHandleRef,
  terminalOpen,
  onToggleTerminal,
  providerReady,
  workspaceRoot,
}: ChatPaneProps) {
  const hasMessages = useChatStore((state) => state.messages.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasMessages ? (
        <ChatContainer />
      ) : providerReady === false ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-bg-elevated text-text-muted">
            <SettingsIcon className="h-5 w-5" />
          </span>
          <h2 className="text-md font-semibold text-text">
            Add a provider to get started
          </h2>
          <p className="max-w-sm text-sm text-text-secondary">
            OpenArtifact needs an API key or a local model before it can run.
            Configure a provider in settings — keys stay on this machine.
          </p>
          <Button
            variant="primary"
            size="sm"
            icon={<SettingsIcon className="h-4 w-4" />}
            onClick={onOpenSettings}
          >
            Open settings
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-bg-elevated text-text-muted">
            <MessageSquareIcon className="h-5 w-5" />
          </span>
          <h2 className="text-md font-semibold text-text">
            Ask about your project
          </h2>
          <p className="max-w-sm text-sm text-text-secondary">
            Describe what you want OpenArtifact to do. It reads files on its
            own, then shows the edits, commands and terminal output here for
            you to approve as it works.
          </p>
          {workspaceRoot !== undefined && workspaceRoot !== null && (
            <p
              className="max-w-sm truncate font-mono text-xs text-text-muted"
              title={workspaceRoot}
            >
              Working in {workspaceRoot}
            </p>
          )}
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
