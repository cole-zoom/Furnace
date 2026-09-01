import type { TaskPriority, TaskStatus } from "@/lib/database.types";
import { cn } from "@/lib/utils";

export const STATUS_META: Record<
  TaskStatus,
  { label: string; dot: string; chip: string }
> = {
  todo: {
    label: "Todo",
    dot: "bg-[var(--fg-caption)]",
    chip: "bg-bg-subtle text-fg-muted",
  },
  in_progress: {
    label: "In progress",
    dot: "bg-blue-500",
    chip: "bg-blue-500/10 text-link",
  },
  blocked: {
    label: "Blocked",
    dot: "bg-red-500",
    chip: "bg-red-500/10 text-danger",
  },
  done: {
    label: "Done",
    dot: "bg-green-500",
    chip: "bg-green-500/10 text-[var(--success)]",
  },
};

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; chip: string; bars: number }
> = {
  low: { label: "Low", chip: "text-fg-caption", bars: 1 },
  medium: { label: "Medium", chip: "text-fg-muted", bars: 2 },
  high: { label: "High", chip: "text-[var(--warning)]", bars: 3 },
  urgent: { label: "Urgent", chip: "text-danger", bars: 4 },
};

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "blocked", "done"];
export const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];

export function StatusChip({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        meta.chip,
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

/**
 * Priority as a four-bar meter. Reads faster than a coloured word in a dense
 * table, and stays legible for anyone who can't rely on the colour alone.
 */
export function PriorityBars({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  const meta = PRIORITY_META[priority];
  return (
    <span
      className={cn("inline-flex items-end gap-[2px]", meta.chip, className)}
      title={`${meta.label} priority`}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-[1px] transition-colors duration-[50ms]",
            i < meta.bars ? "bg-current" : "bg-[var(--stroke)]",
          )}
          style={{ height: 4 + i * 2.5 }}
        />
      ))}
      <span className="sr-only">{meta.label} priority</span>
    </span>
  );
}

export function Chip({
  children,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "neutral" | "ember" | "blue" | "danger" | "success";
}) {
  const tones = {
    neutral: "bg-bg-subtle text-fg-muted",
    ember: "bg-[var(--color-ember-500)]/12 text-[var(--ember)]",
    blue: "bg-blue-500/10 text-link",
    danger: "bg-red-500/10 text-danger",
    success: "bg-green-500/10 text-[var(--success)]",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded
                 bg-bg-subtle px-1 font-sans text-[11px] font-medium text-fg-subtle
                 surface"
    >
      {children}
    </kbd>
  );
}
