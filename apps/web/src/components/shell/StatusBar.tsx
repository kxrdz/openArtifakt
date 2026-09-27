import type { AgentState } from "@openartifact/shared";

import { useChatStore } from "../../store/chatStore";
import { shortcutKeyLabels, SHORTCUTS } from "../command/commands";
import type { Shortcut } from "../command/commands";
import { IconButton, PanelRightIcon, SettingsIcon, StatusDot } from "../ui";
import type { StatusTone } from "../ui";
import { ConversationMenu } from "./ConversationMenu";
import { ProductMark } from "./ProductMark";

/**
 * Agent state shown at a glance in the status bar, wired to the chat store so
 * the loop's state machine (§8) is always visible.
 */
const stateLabel: Record<AgentState, string> = {
  idle: "Idle",
  streaming: "Working",
  awaiting_approval: "Waiting for approval",
  executing_tool: "Running tool",
  done: "Done",
  error: "Error",
  cancelled: "Cancelled",
};

const stateTone: Record<AgentState, StatusTone> = {
  idle: "neutral",
  streaming: "running",
  awaiting_approval: "warning",
  executing_tool: "running",
  done: "success",
  error: "danger",
  cancelled: "neutral",
};

const statePulse: Record<AgentState, boolean> = {
  idle: false,
  streaming: true,
  awaiting_approval: false,
  executing_tool: true,
  done: false,
  error: false,
  cancelled: false,
};

export interface StatusBarProps {
  /** Opens the settings drawer (§12.8). */
  onOpenSettings?: () => void;
  /**
   * Opens the artifact panel. Only provided on narrow screens, where the panel
   * is a full-screen sheet; on desktop the panel is toggled via onTogglePanel.
   */
  onOpenPanel?: () => void;
  /** Desktop only: collapses/expands the inline artifact panel (`Mod+\`). */
  onTogglePanel?: () => void;
  /** Whether the inline panel is visible (drives aria-pressed on the toggle). */
  panelOpen?: boolean;
}

/** The shortcut as a tooltip suffix for icon-only triggers (design note: a
 * visible keycap would crowd the dense status bar; the palette shows it too). */
function hintTitle(label: string, shortcut: Shortcut): string {
  return `${label} (${shortcutKeyLabels(shortcut).join("+")})`;
}

export function StatusBar({
  onOpenSettings,
  onOpenPanel,
  onTogglePanel,
  panelOpen,
}: StatusBarProps) {
  const agentState = useChatStore((state) => state.agentState);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg-elevated px-3">
      <ProductMark />
      <div className="ml-auto flex items-center gap-1">
        <span className="mr-2 inline-flex items-center gap-1.5 text-xs text-text-secondary">
          <StatusDot
            tone={stateTone[agentState]}
            pulse={statePulse[agentState]}
            label={stateLabel[agentState]}
          />
          {stateLabel[agentState]}
        </span>
        {onOpenPanel && (
          <IconButton
            aria-label="Open artifact panel"
            title={hintTitle("Open artifact panel", SHORTCUTS.toggleArtifactPanel)}
            icon={<PanelRightIcon className="h-4 w-4" />}
            onClick={onOpenPanel}
          />
        )}
        {onTogglePanel && (
          <IconButton
            aria-label="Toggle artifact panel"
            aria-pressed={panelOpen}
            title={hintTitle("Toggle artifact panel", SHORTCUTS.toggleArtifactPanel)}
            icon={<PanelRightIcon className="h-4 w-4" />}
            onClick={onTogglePanel}
          />
        )}
        <ConversationMenu />
        <IconButton
          aria-label="Settings"
          title={hintTitle("Settings", SHORTCUTS.openSettings)}
          icon={<SettingsIcon className="h-4 w-4" />}
          onClick={onOpenSettings}
        />
      </div>
    </header>
  );
}
