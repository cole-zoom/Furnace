"use client";

import { useId, useState } from "react";
import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  email,
  size = 22,
  className,
}: {
  name?: string | null;
  email?: string | null;
  size?: number;
  className?: string;
}) {
  // Deterministic hue from the identity, so the same person keeps the same
  // colour across every view without us storing one.
  const seed = (name || email || "?")
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const hue = seed % 360;

  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.4),
        background: `oklch(0.93 0.045 ${hue})`,
        color: `oklch(0.42 0.12 ${hue})`,
      }}
      title={name || email || undefined}
    >
      {initials(name, email)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative block overflow-hidden rounded bg-bg-subtle",
        "after:absolute after:inset-0 after:-translate-x-full",
        "after:bg-gradient-to-r after:from-transparent after:via-black/[.045] after:to-transparent",
        "after:animate-[shimmer_1.4s_infinite]",
        className,
      )}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 grid size-10 place-items-center rounded-lg bg-bg-subtle text-fg-caption">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-[1.5] text-fg-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * CSS-only tooltip. A popover library would be overkill for label-sized hints,
 * and this can't get out of sync with the trigger's position.
 */
export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "right";
  className?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  const position = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  }[side];

  return (
    <span
      className={cn("relative inline-flex", className)}
      onPointerEnter={() => setVisible(true)}
      onPointerLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      aria-describedby={visible ? id : undefined}
    >
      {children}
      {visible && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-[var(--fg)] px-1.5 py-1",
            "text-[11px] font-medium text-[var(--bg)] shadow-e2 animate-fade-up",
            position,
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}

export function SectionHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.055em] text-fg-subtle",
        className,
      )}
    >
      {children}
    </h3>
  );
}
