import { IconButton, SettingsIcon, StatusDot } from "../ui";
import type { StatusTone } from "../ui";
import { ProductMark } from "./ProductMark";

/**
 * Agent state shown at a glance in the status bar. Feature 6 wires the real
 * state machine; the empty shell sits in `idle`.
 */
export type AgentState =
  | "idle"
  | "streaming"
  | "awaiting_approval"
  | "executing_tool"
  | "done"
  | "error"
  | "cancelled";

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
  state?: AgentState;
  /** Settings drawer trigger (feature 8); rendered as a visible seam for now. */
  onOpenSettings?: () => void;
}

export function StatusBar({ state = "idle", onOpenSettings }: StatusBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg-elevated px-3">
      <ProductMark />
      <div className="ml-auto flex items-center gap-1">
        <span className="mr-2 inline-flex items-center gap-1.5 text-xs text-text-secondary">
          <StatusDot
            tone={stateTone[state]}
            pulse={statePulse[state]}
            label={stateLabel[state]}
          />
          {stateLabel[state]}
        </span>
        <IconButton
          aria-label="Settings"
          icon={<SettingsIcon className="h-4 w-4" />}
          onClick={onOpenSettings}
        />
      </div>
    </header>
  );
}
