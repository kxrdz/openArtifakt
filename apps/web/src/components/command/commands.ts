/**
 * Command registry (§12.9, design decision 1).
 *
 * One declarative source of truth for every user-facing command: the global
 * keyboard-shortcut layer (`useKeyboardShortcuts`) and the command palette
 * (`CommandPalette`) both read the same list, so a shortcut and its palette
 * entry can never drift. A command is a plain object with a `run` closure;
 * the concrete list is built by `buildCommands` (task 4.1) so those closures
 * can reach the stores and shell callbacks they trigger.
 */

/** A keyboard binding: modifiers plus a key. `mod` is Meta on macOS and Ctrl
 * elsewhere, but both are accepted so the same chord works everywhere. */
export interface Shortcut {
  mod?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** Lowercase for letters; otherwise the DOM `key` value ("Escape", "\\", ","). */
  key: string;
}

export interface Command {
  /** Stable identifier (used by tests and as a palette item key). */
  id: string;
  label: string;
  /** Extra keywords for fuzzy matching in the palette (e.g. "prompt bar"). */
  hint?: string;
  /** The key binding, when the command has a global shortcut. */
  shortcut?: Shortcut;
  /** Runs the command. */
  run: () => void;
  /** Optional availability predicate; unavailable commands are hidden or inert. */
  when?: () => boolean;
  /**
   * When true, this command may fire even while focus is inside a text field,
   * but only while its `when` predicate (if any) currently passes. Approve and
   * reject opt in so a pending approval stays reachable by keyboard right
   * after `Mod+Enter` leaves focus in the composer.
   */
  allowInEditable?: boolean;
}

/**
 * The minimal keyboard-event shape `matchesShortcut` needs. A DOM
 * `KeyboardEvent` satisfies it; unit tests pass plain literals.
 */
export interface ShortcutEvent {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Normalize a key name for comparison. Single letters also match via the
 * physical `code` (e.g. "KeyA" → "keya"), so Alt+letter works on macOS where
 * `event.key` becomes the composed character (Option+A → "å") while `code`
 * still names the physical key.
 */
function keyMatches(event: ShortcutEvent, key: string): boolean {
  const wanted = key.toLowerCase();
  const candidates = [event.key, event.code ?? ""].map((candidate) =>
    candidate.toLowerCase(),
  );
  return candidates.includes(wanted) || candidates.includes(`key${wanted}`);
}

/**
 * True when the event's modifier state matches the shortcut's. The `mod`
 * modifier accepts either Meta or Ctrl, so a chord works on any platform.
 */
export function matchesShortcut(
  event: ShortcutEvent,
  shortcut: Shortcut,
): boolean {
  const mod = Boolean(event.metaKey || event.ctrlKey);
  if (Boolean(shortcut.mod) !== mod) return false;
  if (Boolean(shortcut.alt) !== event.altKey) return false;
  if (Boolean(shortcut.shift) !== event.shiftKey) return false;
  return keyMatches(event, shortcut.key);
}

/**
 * True for the two shortcuts allowed to fire while focus is inside a text
 * field: Escape (stop / close the top overlay) and Mod+K (command palette).
 * Everything else is suppressed so typing never triggers an action.
 */
export function isEditableSafeShortcut(shortcut: Shortcut): boolean {
  const key = shortcut.key.toLowerCase();
  if (shortcut.alt || shortcut.shift) return false;
  if (!shortcut.mod) return key === "escape";
  return key === "k";
}

/** True on macOS (labels the Mod key as ⌘ rather than Ctrl). */
export function detectIsMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ||
    /Macintosh/i.test(navigator.userAgent)
  );
}

/** The display label for the Mod key on this platform (⌘ or Ctrl). */
export function modKeyLabel(isMac = detectIsMac()): string {
  return isMac ? "⌘" : "Ctrl";
}

/** Human-readable label for a single key, abbreviated for keycap rendering. */
function displayKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower === "escape") return "Esc";
  if (lower === "enter") return "Enter";
  if (lower === "arrowup") return "↑";
  if (lower === "arrowdown") return "↓";
  if (key === "\\") return "\\";
  // Single letters render as uppercase keycaps.
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  return key;
}

/**
 * Keycap labels for a shortcut in press order (modifier keys then the key),
 * for `Kbd` hints and the command palette.
 */
export function shortcutKeyLabels(
  shortcut: Shortcut | undefined,
  isMac = detectIsMac(),
): string[] {
  if (shortcut === undefined) return [];
  const labels: string[] = [];
  if (shortcut.mod) labels.push(modKeyLabel(isMac));
  if (shortcut.alt) labels.push(isMac ? "⌥" : "Alt");
  if (shortcut.shift) labels.push(isMac ? "⇧" : "Shift");
  labels.push(displayKey(shortcut.key));
  return labels;
}

/**
 * The default key map (design decision 2). A single source of truth shared by
 * the global shortcut layer and the `Kbd` hints on the controls, so a binding
 * and its on-screen hint can never drift.
 */
export const SHORTCUTS = {
  send: { mod: true, key: "Enter" },
  stop: { key: "Escape" },
  approve: { alt: true, key: "a" },
  reject: { alt: true, key: "r" },
  toggleArtifactPanel: { mod: true, key: "\\" },
  toggleTerminalLog: { mod: true, key: "j" },
  openSettings: { mod: true, key: "," },
  focusChatInput: { mod: true, key: "i" },
} satisfies Record<string, Shortcut>;

/**
 * The side effects a command can trigger (design decision 1). `buildCommands`
 * receives these closures so the concrete list can reach the stores and the
 * shell's state (sheet/settings/terminal/panel toggles) without the registry
 * importing either.
 */
export interface CommandActions {
  send: () => void;
  stop: () => void;
  approve: () => void;
  reject: () => void;
  toggleArtifactPanel: () => void;
  toggleTerminalLog: () => void;
  openSettings: () => void;
  toggleTheme: () => void;
  newConversation: () => void;
  undoLastTurn: () => void;
  focusChatInput: () => void;
  jumpToArtifactPanel: () => void;
}

/** Availability snapshots that gate the conditional commands. */
export interface CommandAvailability {
  /** A turn is in flight (Send becomes Stop). */
  sending: boolean;
  /** An approval card is waiting for a decision. */
  hasApproval: boolean;
  /** The last completed turn changed files and can be undone. */
  hasUndoableTurn: boolean;
}

/**
 * Build the concrete command list (task 4.1). One list drives both the global
 * shortcut layer and the command palette; the palette-only commands (theme,
 * new conversation, undo, jump) carry no `shortcut` and so appear only there.
 */
export function buildCommands(
  actions: CommandActions,
  availability: CommandAvailability,
): Command[] {
  return [
    {
      id: "send",
      label: "Send message",
      hint: "submit",
      shortcut: SHORTCUTS.send,
      run: actions.send,
      when: () => !availability.sending,
    },
    {
      id: "stop",
      label: "Stop",
      hint: "cancel turn",
      shortcut: SHORTCUTS.stop,
      run: actions.stop,
      when: () => availability.sending,
    },
    {
      id: "approve",
      label: "Approve pending action",
      hint: "allow",
      shortcut: SHORTCUTS.approve,
      run: actions.approve,
      when: () => availability.hasApproval,
      allowInEditable: true,
    },
    {
      id: "reject",
      label: "Reject pending action",
      hint: "deny",
      shortcut: SHORTCUTS.reject,
      run: actions.reject,
      when: () => availability.hasApproval,
      allowInEditable: true,
    },
    {
      id: "toggle-artifact-panel",
      label: "Toggle artifact panel",
      hint: "panel",
      shortcut: SHORTCUTS.toggleArtifactPanel,
      run: actions.toggleArtifactPanel,
    },
    {
      id: "toggle-terminal-log",
      label: "Toggle terminal log",
      hint: "output",
      shortcut: SHORTCUTS.toggleTerminalLog,
      run: actions.toggleTerminalLog,
    },
    {
      id: "open-settings",
      label: "Open settings",
      hint: "preferences",
      shortcut: SHORTCUTS.openSettings,
      run: actions.openSettings,
    },
    {
      id: "toggle-theme",
      label: "Toggle theme",
      hint: "light dark",
      run: actions.toggleTheme,
    },
    {
      id: "focus-chat-input",
      label: "Focus chat input",
      hint: "composer",
      shortcut: SHORTCUTS.focusChatInput,
      run: actions.focusChatInput,
    },
    {
      id: "new-conversation",
      label: "New conversation",
      hint: "clear",
      run: actions.newConversation,
    },
    {
      id: "undo-last-turn",
      label: "Undo last turn",
      hint: "revert",
      run: actions.undoLastTurn,
      when: () => availability.hasUndoableTurn,
    },
    {
      id: "jump-to-artifact-panel",
      label: "Jump to artifact panel",
      hint: "artifact version",
      run: actions.jumpToArtifactPanel,
    },
  ];
}
