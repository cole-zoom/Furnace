"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "icon" | "icon-sm";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

/*
 * Borders are drawn as inset box-shadows rather than real borders so a button
 * never shifts its neighbours by a pixel when it gains or loses emphasis.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-blue-500 text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,.08),0_1px_2px_-1px_rgba(15,107,233,.28)] " +
    "hover:bg-blue-450 active:bg-blue-600",
  secondary:
    "bg-bg text-fg-body shadow-[inset_0_0_0_1px_var(--stroke),var(--shadow-layer-1)] " +
    "hover:bg-bg-subtle active:bg-bg-inset",
  subtle:
    "bg-bg-subtle text-fg-body hover:bg-bg-inset active:bg-bg-inset",
  ghost:
    "bg-transparent text-fg-muted hover:bg-bg-subtle hover:text-fg-body active:bg-bg-inset",
  danger:
    "bg-transparent text-danger surface hover:bg-red-500/8 active:bg-red-500/14",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 gap-1.5 px-2 text-[13px] rounded-md",
  md: "h-8 gap-1.5 px-2.5 text-sm rounded-md",
  icon: "h-8 w-8 justify-center rounded-md",
  "icon-sm": "h-7 w-7 justify-center rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center font-medium whitespace-nowrap",
        // 50ms is Attio's hover duration — fast enough to feel mechanical.
        "transition-[background-color,box-shadow,color,opacity] duration-[50ms] ease-[cubic-bezier(.2,0,0,1)]",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
});
