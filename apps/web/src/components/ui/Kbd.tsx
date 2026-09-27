import type { ReactNode } from "react";
import { cn } from "./cn";

export interface KbdProps {
  children: ReactNode;
  className?: string;
}

/**
 * Keyboard hint. Keycaps use the sans face (mono is reserved for code, paths
 * and terminal output), with a subtle keycap edge from the stronger border and
 * the elevation token.
 */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 items-center justify-center rounded-sm border border-border-strong bg-bg-elevated px-1.5 font-sans text-xs font-medium leading-none text-text-secondary shadow-1",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
