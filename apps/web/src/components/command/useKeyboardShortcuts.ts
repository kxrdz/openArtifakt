import { useEffect } from "react";

import {
  isEditableSafeShortcut,
  matchesShortcut,
  type Command,
  type ShortcutEvent,
} from "./commands";

/**
 * Global keyboard-shortcut binding (§12.9, design decision 1).
 *
 * Binds a command list's `shortcut` entries on a window-level `keydown` in the
 * capture phase. Handled bindings call `preventDefault()` so browser chrome
 * (Cmd+J downloads, Cmd+, preferences, Cmd+I italic) is suppressed. While
 * focus is inside a text field or contenteditable, every binding except Escape
 * and Mod+K is suppressed, so typing never triggers an action.
 */

/** True when the event target is a text field, textarea, select or editable. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** A keydown event shape the pure dispatcher accepts (DOM + synthetic). */
export interface ShortcutKeydownEvent extends ShortcutEvent {
  target?: EventTarget | null;
  preventDefault?: () => void;
}

/**
 * Run the first command whose shortcut matches the event. Returns true when a
 * command fired. Pure and exported so it can be unit-tested without a
 * component.
 */
export function runMatchingShortcut(
  event: ShortcutKeydownEvent,
  commands: Command[],
): boolean {
  const inEditable = isEditableTarget(event.target ?? null);
  for (const command of commands) {
    const shortcut = command.shortcut;
    if (shortcut === undefined) continue;
    if (!matchesShortcut(event, shortcut)) continue;
    // Inside text fields, only Escape and Mod+K are allowed through.
    if (inEditable && !isEditableSafeShortcut(shortcut)) continue;
    if (command.when !== undefined && !command.when()) continue;
    event.preventDefault?.();
    command.run();
    return true;
  }
  return false;
}

export interface KeyboardShortcutOptions {
  /** Bind only while enabled (default true). */
  enabled?: boolean;
  /** Listen on this target (default window). */
  target?: Window;
}

/**
 * Bind a command list's global shortcuts. Re-binds when the command list or
 * options change; removes the listener on unmount.
 */
export function useKeyboardShortcuts(
  commands: Command[],
  options: KeyboardShortcutOptions = {},
): void {
  const { enabled = true, target = window } = options;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      runMatchingShortcut(event, commands);
    };
    // Capture phase: the shell resolves shortcuts before a focused child can
    // swallow the key, and it matches design decision 1.
    target.addEventListener("keydown", onKeyDown, true);
    return () => target.removeEventListener("keydown", onKeyDown, true);
  }, [commands, enabled, target]);
}
