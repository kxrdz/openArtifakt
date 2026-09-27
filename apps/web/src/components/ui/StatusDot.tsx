import { cn } from "./cn";

export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "running"
  | "neutral";

const toneClasses: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  running: "bg-running",
  neutral: "bg-text-faint",
};

export interface StatusDotProps {
  tone?: StatusTone;
  /** Pulse (opacity) while a process is running. */
  pulse?: boolean;
  /** Accessible name when the dot carries meaning on its own; otherwise decorative. */
  label?: string;
  className?: string;
}

export function StatusDot({
  tone = "neutral",
  pulse = false,
  label,
  className,
}: StatusDotProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        toneClasses[tone],
        pulse && "animate-pulse",
        className,
      )}
    />
  );
}
