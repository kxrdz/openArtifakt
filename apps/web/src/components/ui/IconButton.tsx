import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { focusRing } from "./focus-ring";
import { Spinner } from "./Spinner";

export type IconButtonVariant = "ghost" | "secondary" | "danger";
export type IconButtonSize = "sm" | "md";

const variantClasses: Record<IconButtonVariant, string> = {
  ghost: "text-text-secondary hover:bg-bg-hover hover:text-text",
  secondary:
    "border border-border bg-bg-elevated text-text-secondary hover:border-border-strong hover:bg-bg-hover hover:text-text",
  danger: "border border-border text-danger hover:border-danger hover:bg-danger-bg",
};

const sizeClasses: Record<IconButtonSize, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
};

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only button must announce its action. */
  "aria-label": string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      "aria-label": ariaLabel,
      icon,
      variant = "ghost",
      size = "md",
      loading = false,
      className,
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
        aria-label={ariaLabel}
        title={ariaLabel}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex select-none items-center justify-center rounded-md transition-colors duration-fast ease-out",
          focusRing,
          variantClasses[variant],
          sizeClasses[size],
          loading ? "cursor-default" : "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...rest}
      >
        {loading ? <Spinner size="sm" tone="accent" /> : icon}
      </button>
    );
  },
);
