"use client";

import { CalendarDays, GripVertical, Link2 } from "lucide-react";
import { PriorityBars } from "@/components/ui/badge";
import { cn, dueLabel } from "@/lib/utils";
import type { Task } from "@/lib/database.types";

const DUE_TONE = {
  overdue: "text-danger",
  today: "text-[var(--ember)]",
  soon: "text-fg-muted",
  later: "text-fg-caption",
  none: "text-fg-caption",
} as const;

export function TaskCard({
  task,
  onClick,
  dragging,
  className,
}: {
  task: Task;
  onClick?: () => void;
  dragging?: boolean;
  className?: string;
}) {
  const due = dueLabel(task.due_date);

  return (
    <div
      onClick={onClick}
      className={cn(
        // No cursor here: TaskCard also renders inside the DragOverlay, where
        // its own cursor would win over the wrapper's grabbing cursor.
        "group/card relative rounded-lg bg-bg p-2.5",
        "surface-e1",
        "transition-[box-shadow,transform] duration-100 ease-[cubic-bezier(.2,0,0,1)]",
        "hover:surface-e2-strong",
        dragging && "opacity-40",
        task.status === "done" && "opacity-65",
        className,
      )}
    >
      <div className="flex items-start gap-1.5">
        {/* Affordance only — the drag listeners are on the card itself, so this
            must not swallow pointer events. */}
        <span
          aria-hidden
          className="pointer-events-none -ml-1 mt-[1px] p-0.5 text-fg-disabled opacity-0
                     transition-opacity duration-[50ms] group-hover/card:opacity-100"
        >
          <GripVertical className="size-3.5" />
        </span>

        <p
          className={cn(
            "min-w-0 flex-1 text-[13px] leading-[1.35] text-fg-body",
            task.status === "done" && "line-through decoration-fg-caption",
          )}
        >
          {task.title}
        </p>

        <PriorityBars priority={task.priority} className="mt-0.5 shrink-0" />
      </div>

      {task.description && (
        <p className="mt-1.5 line-clamp-2 pl-[18px] text-[12px] leading-[1.45] text-fg-caption">
          {task.description}
        </p>
      )}

      {(task.due_date || task.meeting_id) && (
        <div className="mt-2 flex items-center gap-2.5 pl-[18px]">
          {task.due_date && (
            <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", DUE_TONE[due.tone])}>
              <CalendarDays className="size-3" />
              {due.label}
            </span>
          )}
          {task.meeting_id && (
            <span className="inline-flex items-center gap-1 text-[11px] text-fg-caption" title="From a meeting">
              <Link2 className="size-3" />
              Meeting
            </span>
          )}
        </div>
      )}
    </div>
  );
}
