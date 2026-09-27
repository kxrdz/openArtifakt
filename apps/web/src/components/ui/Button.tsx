import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { focusRing } from "./focus-ring";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary:
    "border border-border bg-bg-elevated text-text hover:border-border-strong hover:bg-bg-hover",
  ghost: "text-text-secondary hover:bg-bg-hover hover:text-text",
  danger:
    "border border-border text-danger hover:border-danger hover:bg-danger-bg",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-xs",
  md: "h-8 gap-2 px-3 text-sm",
};

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Busy state: shows a spinner and blocks activation without dimming the label. */
  loading?: boolean;
  /** Leading icon (a drawn SVG, not an emoji). */
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      loading = false,
      icon,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex select-none items-center justify-center rounded-md font-medium transition-colors duration-fast ease-out",
          focusRing,
          variantClasses[variant],
          sizeClasses[size],
          loading ? "cursor-default" : "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...rest}
      >
        {loading ? (
          <Spinner
            size="sm"
            tone={variant === "primary" ? "inverse" : "accent"}
          />
        ) : (
          icon
        )}
        {children}
      </button>
    );
  },
);
