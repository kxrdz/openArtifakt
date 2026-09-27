import { Button, MessageSquareIcon, PanelRightIcon } from "../ui";
import { TerminalLog } from "./TerminalLog";

export interface ChatPaneProps {
  /**
   * Narrow screens only: opens the artifact panel as a full-screen sheet.
   * Omitted on desktop where the panel is always visible beside the chat.
   */
  onOpenPanel?: () => void;
}

/**
 * The chat pane — conversation region (empty state for now) plus the
 * collapsible terminal log at its foot.
 */
export function ChatPane({ onOpenPanel }: ChatPaneProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-bg-elevated text-text-muted">
          <MessageSquareIcon className="h-5 w-5" />
        </span>
        <h2 className="text-md font-semibold text-text">No conversation yet</h2>
        <p className="max-w-sm text-sm text-text-secondary">
          Ask OpenArtifact to read, edit and run code in your project. Reads run
          automatically; edits and commands ask before they run.
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
      <TerminalLog />
    </div>
  );
}
