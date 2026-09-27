import { cn } from "./cn";

export type SpinnerTone = "accent" | "inverse";
export type SpinnerSize = "sm" | "md" | "lg";

const toneClasses: Record<SpinnerTone, string> = {
  accent: "border-t-accent",
  inverse: "border-t-accent-fg",
};

const sizeClasses: Record<SpinnerSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export interface SpinnerProps {
  /** Accent on normal surfaces; inverse on solid-accent surfaces. */
  tone?: SpinnerTone;
  size?: SpinnerSize;
  /** Accessible name for the busy indicator. */
  label?: string;
  className?: string;
}

export function Spinner({
  tone = "accent",
  size = "md",
  label = "Loading",
  className,
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-transparent",
        toneClasses[tone],
        sizeClasses[size],
        className,
      )}
    />
  );
}
