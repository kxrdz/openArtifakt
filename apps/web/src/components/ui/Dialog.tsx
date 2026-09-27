import { useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";

import { cn } from "./cn";

/**
 * Dialog/overlay primitive (§12.9, design decision 5).
 *
 * The one modal shell shared by the command palette, the settings drawer and
 * the full-screen artifact sheet: a token scrim (`--color-scrim` → `bg-scrim`),
 * a focus trap (Tab cycles within the panel, focus is restored to the element
 * that had it when the dialog opened), Escape-to-close, and an enter animation
 * that is applied only under `motion-safe:` so `prefers-reduced-motion` gets a
 * no-op appearance with no JavaScript involved.
 *
 * Positioning of the panel (centred palette, right drawer, full sheet) is left
 * to the consumer via `className`; this primitive owns only the modal
 * behaviour so every overlay feels and behaves identically.
 */

/** Every element that can receive Tab focus (matches the browser's own set). */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export interface DialogProps {
  /** Whether the dialog is open. When false nothing renders and focus is restored. */
  open: boolean;
  /** Dismisses the dialog (Escape, the scrim, or the consumer's close action). */
  onClose: () => void;
  /** Accessible name, announced when the dialog opens. */
  label: string;
  /** Panel content (positioning classes go on `className`). */
  children: ReactNode;
  /** Extra classes for the panel (consumer owns placement: centred, drawer, sheet). */
  className?: string;
  /** Extra classes for the scrim. */
  scrimClassName?: string;
  /** Element to focus on open; defaults to the first focusable in the panel. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function Dialog({
  open,
  onClose,
  label,
  children,
  className,
  scrimClassName,
  initialFocusRef,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog on open and restore it to the previously
  // focused element on close, so keyboard flow never gets lost behind a modal.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panel = panelRef.current;
    const target =
      initialFocusRef?.current ??
      (panel === null ? null : focusableElements(panel)[0]) ??
      panel;
    target?.focus();

    return () => {
      previouslyFocused?.focus();
    };
  }, [open, initialFocusRef]);

  // Escape dismisses the top-most overlay; Tab cycles focus within the panel.
  // Capture phase so the dialog resolves keys before a focused child swallows
  // them and before any bubble-phase listener acts.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (panel === null) return;

      const focusables = focusableElements(panel);
      if (focusables.length === 0) {
        // Nothing to tab to: keep focus on the panel itself.
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      const activeInPanel = active !== null && panel.contains(active);

      if (event.shiftKey) {
        if (!activeInPanel || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!activeInPanel || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-scrim motion-safe:animate-dialog-fade-in",
          scrimClassName,
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "absolute bg-bg-elevated shadow-3 motion-safe:animate-dialog-panel-in",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
