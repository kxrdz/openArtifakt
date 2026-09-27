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
