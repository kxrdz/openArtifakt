import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { cn } from "../ui/cn";
import { Dialog } from "../ui/Dialog";
import { focusRing } from "../ui/focus-ring";
import { Kbd } from "../ui/Kbd";
import { matchesShortcut, shortcutKeyLabels, type Command } from "./commands";

/**
 * Command palette (§12.9, design decisions 1 & 6).
 *
 * A self-contained, keyboard-first overlay listing every command in the
 * registry, reachable from anywhere with Mod+K (Cmd+K on macOS, Ctrl+K
 * elsewhere). It is built on the shared `Dialog` primitive (scrim, focus trap,
 * Escape-to-close, reduced-motion) and reads the same `Command` list the
 * global shortcut layer binds, so a palette entry and its shortcut can never
 * drift. Filtering is a dependency-free case-insensitive subsequence match
 * over the label and `hint`; Up/Down move the active item and Enter runs it.
 */

/** Case-insensitive subsequence match over a haystack string. */
export function fuzzyMatch(haystack: string, query: string): boolean {
  const needle = query.toLowerCase();
  if (needle === "") return true;
  const source = haystack.toLowerCase();
  let cursor = 0;
  for (const char of needle) {
    cursor = source.indexOf(char, cursor);
    if (cursor === -1) return false;
    cursor += 1;
  }
  return true;
}

/** Available commands whose label/hint fuzzy-match the query, in registry order. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const available = commands.filter(
    (command) => command.when === undefined || command.when(),
  );
  const trimmed = query.trim();
  if (trimmed === "") return available;
  return available.filter((command) =>
    fuzzyMatch(`${command.label} ${command.hint ?? ""}`, trimmed),
  );
}

export interface CommandPaletteProps {
  /** The command registry to list, filter and run. */
  commands: Command[];
  /** Called with the executed command just before it runs and the palette closes. */
  onRun?: (command: Command) => void;
  /** Notified on open/close so the shell can suppress global shortcuts. */
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({
  commands,
  onRun,
  onOpenChange,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mod+K opens the palette from anywhere. Window capture so it wins over a
  // focused child, and preventDefault suppresses browser chrome (Cmd+K).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, { mod: true, key: "k" })) return;
      event.preventDefault();
      setQuery("");
      setActiveIndex(0);
      setOpen(true);
      onOpenChange?.(true);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onOpenChange]);

  const results = useMemo(
    () => filterCommands(commands, query),
    [commands, query],
  );

  // The active index can outgrow the filtered list (a new query, or the
  // availability set shrinking); clamp it so the highlight and Enter target a
  // real item.
  const clampedIndex = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);
  const activeCommand =
    results.length === 0 ? undefined : results[clampedIndex];

  // Keep the active item in view as arrow navigation moves through the list.
  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(
      `command-palette-option-${clampedIndex}`,
    );
    el?.scrollIntoView?.({ block: "nearest" });
  }, [open, clampedIndex]);

  const closePalette = () => {
    setOpen(false);
    onOpenChange?.(false);
    setQuery("");
    setActiveIndex(0);
  };

  const runCommand = (command: Command) => {
    onRun?.(command);
    command.run();
    closePalette();
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(
        results.length === 0 ? 0 : (clampedIndex + 1) % results.length,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        results.length === 0
          ? 0
          : (clampedIndex - 1 + results.length) % results.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeCommand) runCommand(activeCommand);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={closePalette}
      label="Command palette"
      initialFocusRef={inputRef}
      className="left-0 right-0 top-20 mx-auto w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border"
    >
      <div className="flex items-center gap-2 border-b border-border px-3">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={
            activeCommand ? `command-palette-option-${clampedIndex}` : undefined
          }
          aria-label="Search commands"
          placeholder="Type a command…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          className={cn(
            "h-11 w-full bg-transparent text-base text-text placeholder:text-text-muted",
            focusRing,
          )}
        />
        <Kbd className="shrink-0">Esc</Kbd>
      </div>
      <ul
        id="command-palette-list"
        role="listbox"
        aria-label="Commands"
        className="max-h-80 overflow-y-auto p-1.5"
      >
        {results.length === 0 ? (
          <li role="none" className="px-3 py-6 text-center text-sm text-text-muted">
            No matching commands
          </li>
        ) : (
          results.map((command, index) => {
            const active = index === clampedIndex;
            return (
              <li key={command.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  id={`command-palette-option-${index}`}
                  tabIndex={-1}
                  onClick={() => runCommand(command)}
                  onMouseMove={() => {
                    if (!active) setActiveIndex(index);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors duration-fast",
                    active
                      ? "bg-bg-hover text-text"
                      : "text-text-secondary hover:bg-bg-hover hover:text-text",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {command.hint && (
                    <span className="truncate text-xs text-text-secondary">
                      {command.hint}
                    </span>
                  )}
                  {command.shortcut && (
                    <span className="flex shrink-0 items-center gap-1">
                      {shortcutKeyLabels(command.shortcut).map((cap) => (
                        <Kbd key={cap}>{cap}</Kbd>
                      ))}
                    </span>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </Dialog>
  );
}
