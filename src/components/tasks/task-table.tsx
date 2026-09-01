"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  PRIORITY_META,
  PriorityBars,
  STATUS_META,
  StatusChip,
} from "@/components/ui/badge";
import { useShell } from "@/components/app-shell";
import { setTaskStatus } from "@/lib/actions";
import { cn, dueLabel, relativeTime } from "@/lib/utils";
import type { Task } from "@/lib/database.types";

type SortKey = "title" | "status" | "priority" | "due_date" | "created_at";

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
const STATUS_RANK = { in_progress: 0, blocked: 1, todo: 2, done: 3 } as const;

const DUE_TONE = {
  overdue: "text-danger",
  today: "text-[var(--ember)]",
  soon: "text-fg-body",
  later: "text-fg-caption",
  none: "text-fg-caption",
} as const;

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "title", label: "Task" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "due_date", label: "Due" },
  { key: "created_at", label: "Created" },
];

/*
 * Header and rows share one grid template. With flex widths the two drift apart
 * as soon as a cell's content is wider than its declared width — the row's
 * flexible title column gives up the difference and every header label ends up
 * a couple of dozen pixels right of the data it names.
 */
const GRID = "grid grid-cols-[16px_minmax(0,1fr)_124px_100px_92px_104px] items-center gap-3 px-4";

export function TaskTable({ tasks }: { tasks: Task[] }) {
  const { editTask } = useShell();
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "priority",
    dir: 1,
  });

  const sorted = useMemo(() => {
    const value = (t: Task): string | number => {
      switch (sort.key) {
        case "title": return t.title.toLowerCase();
        case "status": return STATUS_RANK[t.status];
        case "priority": return PRIORITY_RANK[t.priority];
        // Undated tasks sort last regardless of direction — an empty due date
        // isn't "earliest", it's "not scheduled".
        case "due_date": return t.due_date ?? "9999-12-31";
        case "created_at": return t.created_at;
      }
    };

    return [...tasks].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (av < bv) return -1 * sort.dir;
      if (av > bv) return 1 * sort.dir;
      return 0;
    });
  }, [tasks, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 },
    );

  const toggleDone = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = task.status === "done" ? "todo" : "done";
    const result = await setTaskStatus(task.id, next);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className={cn(GRID, "h-8 shrink-0 border-b border-[var(--stroke)] bg-bg-raised/60")}>
        <span aria-hidden />
        {COLUMNS.map((col) => (
          <button
            key={col.key}
            onClick={() => toggleSort(col.key)}
            className={cn(
              "flex min-w-0 items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-[0.055em]",
              "transition-colors duration-[50ms]",
              sort.key === col.key ? "text-fg-muted" : "text-fg-caption hover:text-fg-subtle",
            )}
          >
            <span className="truncate">{col.label}</span>
            {sort.key === col.key &&
              (sort.dir === 1 ? (
                <ArrowUp className="size-3 shrink-0" />
              ) : (
                <ArrowDown className="size-3 shrink-0" />
              ))}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.map((task) => {
          const due = dueLabel(task.due_date);
          const done = task.status === "done";

          return (
            <div
              key={task.id}
              onClick={() => editTask(task)}
              className={cn(
                GRID,
                "group/row h-9 cursor-pointer border-b border-[var(--stroke-weak)]",
                "transition-colors duration-[50ms] hover:bg-bg-subtle",
              )}
            >
              <button
                onClick={(e) => void toggleDone(task, e)}
                aria-label={done ? "Mark as todo" : "Mark as done"}
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-[4px] transition-all duration-[50ms]",
                  done
                    ? "bg-green-500 text-white"
                    : "shadow-[inset_0_0_0_1.25px_var(--stroke-strong)] hover:shadow-[inset_0_0_0_1.25px_var(--color-green-500)]",
                )}
              >
                {done && <Check className="size-2.5" strokeWidth={3.5} />}
              </button>

              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    "truncate text-[13px] text-fg-body",
                    done && "text-fg-caption line-through",
                  )}
                >
                  {task.title}
                </span>
                {task.meeting_id && (
                  <Link2 className="size-3 shrink-0 text-fg-caption" aria-label="From a meeting" />
                )}
              </div>

              <div className="min-w-0">
                <StatusChip status={task.status} />
              </div>

              <div className="flex min-w-0 items-center gap-1.5">
                <PriorityBars priority={task.priority} />
                <span className="truncate text-[12px] text-fg-caption">
                  {PRIORITY_META[task.priority].label}
                </span>
              </div>

              <div className={cn("min-w-0 truncate text-[12px] font-medium", DUE_TONE[due.tone])}>
                {due.label || "—"}
              </div>

              <div className="min-w-0 truncate text-[12px] text-fg-caption">
                {relativeTime(task.created_at)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { STATUS_META };
