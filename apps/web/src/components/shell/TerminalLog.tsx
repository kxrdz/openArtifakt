import { useState } from "react";
import { ChevronDownIcon, cn, focusRing, TerminalIcon } from "../ui";

/**
 * Collapsible terminal log, pinned to the bottom of the chat pane.
 *
 * Feature 6 streams command output into the body; the empty shell shows a
 * collapsed-to-open empty region with the placeholder seam in place. The
 * header is a real button so collapsing works from the keyboard today.
 */
export function TerminalLog() {
  const [open, setOpen] = useState(true);

  return (
    <section
      aria-label="Terminal log"
      className="shrink-0 border-t border-border bg-bg-sunken"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center gap-2 px-3 text-xs font-medium text-text-secondary transition-colors duration-fast hover:bg-bg-hover hover:text-text",
          focusRing,
        )}
      >
        <TerminalIcon className="h-3.5 w-3.5" />
        Terminal log
        <ChevronDownIcon
          className={cn(
            "ml-auto h-4 w-4 transition-transform duration-fast ease-out",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="h-32 overflow-auto border-t border-border px-3 py-2 font-mono text-xs leading-normal text-text-secondary">
          <span>No command output yet.</span>
        </div>
      )}
    </section>
  );
}
