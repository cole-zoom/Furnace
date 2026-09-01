"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Columns3, ListFilter, Plus, Rows3, Search, X } from "lucide-react";
import { PageHeader, useShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Kbd, PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER } from "@/components/ui/badge";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskTable } from "@/components/tasks/task-table";
import { Coal, FuelGauge } from "@/components/coal";
import { createLocalStore } from "@/lib/local-store";
import { cn } from "@/lib/utils";
import type { Task, TaskPriority, TaskStatus } from "@/lib/database.types";

type ViewMode = "board" | "table";

const viewStore = createLocalStore<ViewMode>(
  "furnace-task-view",
  "board",
  (v) => v === "board" || v === "table",
);

export function TasksView({ tasks }: { tasks: Task[] }) {
  const { newTask, editTask } = useShell();
  const searchParams = useSearchParams();

  const view = useSyncExternalStore(
    viewStore.subscribe,
    viewStore.get,
    viewStore.getServer,
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [hideDone, setHideDone] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const chooseView = (next: ViewMode) => viewStore.set(next);

  // Deep link from the command palette: /tasks?task=<id> opens that task.
  const deepLinkId = searchParams.get("task");
  useEffect(() => {
    if (!deepLinkId) return;
    const match = tasks.find((t) => t.id === deepLinkId);
    if (match) editTask(match);
  }, [deepLinkId, tasks, editTask]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (hideDone && t.status === "done") return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (term) {
        const haystack = `${t.title} ${t.description ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [tasks, query, statusFilter, priorityFilter, hideDone]);

  const activeFilters =
    (statusFilter !== "all" ? 1 : 0) + (priorityFilter !== "all" ? 1 : 0) + (hideDone ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter("all");
    setPriorityFilter("all");
    setHideDone(false);
  };

  const openCount = tasks.filter((t) => t.status !== "done").length;

  // Fuel burned today. completed_at is maintained by a database trigger, so
  // this stays honest even when a task is closed from the table checkbox.
  const burnedToday = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return tasks.filter(
      (t) => t.completed_at && new Date(t.completed_at) >= startOfToday,
    ).length;
  }, [tasks]);

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={`${openCount} open`}
        meta={<FuelGauge burned={burnedToday} />}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-caption" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter tasks…"
                className="h-7 w-[190px] rounded-md bg-bg pl-7 pr-2 text-[13px] text-fg-body
                           surface outline-none
                           transition-shadow duration-[50ms]
                           placeholder:text-fg-caption
                           focus:surface-accent"
              />
            </div>

            <Button
              size="sm"
              variant={filtersOpen || activeFilters > 0 ? "subtle" : "ghost"}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <ListFilter className="size-3.5" />
              Filter
              {activeFilters > 0 && (
                <span className="ml-0.5 grid size-4 place-items-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">
                  {activeFilters}
                </span>
              )}
            </Button>

            <div className="flex items-center gap-0.5 rounded-md bg-bg-subtle p-0.5">
              {([
                ["board", Columns3, "Board"],
                ["table", Rows3, "Table"],
              ] as const).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  onClick={() => chooseView(mode)}
                  aria-label={`${label} view`}
                  aria-pressed={view === mode}
                  className={cn(
                    "grid size-6 place-items-center rounded transition-all duration-[50ms]",
                    view === mode
                      ? "bg-bg text-fg-body shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                      : "text-fg-caption hover:text-fg-muted",
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
            </div>

            <Button size="sm" variant="primary" onClick={() => newTask()}>
              <Plus className="size-3.5" />
              New
              <Kbd>N</Kbd>
            </Button>
          </>
        }
      />

      {filtersOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--stroke)] bg-bg-raised/60 px-4 py-2 animate-fade-up">
          <FilterGroup
            label="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as TaskStatus | "all")}
            options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label }))}
          />
          <FilterGroup
            label="Priority"
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v as TaskPriority | "all")}
            options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_META[p].label }))}
          />
          <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-fg-muted">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
              className="size-3.5 accent-[var(--link)]"
            />
            Hide done
          </label>

          {activeFilters > 0 && (
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-[12px] text-fg-caption
                         transition-colors duration-[50ms] hover:text-fg-body"
            >
              <X className="size-3" />
              Clear
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {tasks.length === 0 ? (
          <EmptyState
            icon={<Coal size={22} />}
            title="Nothing in the furnace yet"
            description="Add your first task, or paste a meeting transcript and let Gemini pull the action items out for you."
            action={
              <Button variant="primary" size="sm" onClick={() => newTask()}>
                <Plus className="size-3.5" />
                New task
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="size-4" />}
            title="No tasks match"
            description="Try loosening the filters or clearing the search."
            action={
              <Button size="sm" onClick={() => { setQuery(""); clearFilters(); }}>
                Clear everything
              </Button>
            }
          />
        ) : view === "board" ? (
          <TaskBoard tasks={filtered} />
        ) : (
          <TaskTable tasks={filtered} />
        )}
      </div>
    </>
  );
}

function FilterGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.055em] text-fg-caption">
        {label}
      </span>
      <div className="flex items-center gap-0.5 rounded-md bg-bg-subtle p-0.5">
        {[{ value: "all", label: "All" }, ...options].map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-5 rounded px-1.5 text-[12px] font-medium transition-all duration-[50ms]",
              value === opt.value
                ? "bg-bg text-fg-body shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                : "text-fg-caption hover:text-fg-muted",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
