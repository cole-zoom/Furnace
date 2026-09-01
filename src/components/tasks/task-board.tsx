"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { TaskCard } from "@/components/tasks/task-card";
import { STATUS_META, STATUS_ORDER } from "@/components/ui/badge";
import { useShell } from "@/components/app-shell";
import { moveTask } from "@/lib/actions";
import { cn, midpoint } from "@/lib/utils";
import type { Task, TaskStatus } from "@/lib/database.types";

type Columns = Record<TaskStatus, Task[]>;

function group(tasks: Task[]): Columns {
  const next: Columns = { todo: [], in_progress: [], blocked: [], done: [] };
  for (const task of tasks) next[task.status].push(task);
  for (const status of STATUS_ORDER) {
    next[status].sort((a, b) => a.sort_order - b.sort_order);
  }
  return next;
}

function SortableCard({ task, onEdit }: { task: Task; onEdit: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "z-10" : undefined}
    >
      <TaskCard
        task={task}
        dragging={isDragging}
        handleProps={{ ...attributes, ...listeners }}
        onClick={() => onEdit(task)}
      />
    </div>
  );
}

function Column({
  status,
  tasks,
  onEdit,
  onAdd,
}: {
  status: TaskStatus;
  tasks: Task[];
  onEdit: (t: Task) => void;
  onAdd: (status: TaskStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });
  const meta = STATUS_META[status];

  return (
    <div className="flex min-w-[260px] flex-1 flex-col">
      <div className="mb-2 flex h-7 items-center gap-2 px-0.5">
        <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
        <span className="text-[13px] font-semibold text-fg">{meta.label}</span>
        <span className="rounded bg-bg-subtle px-1.5 text-[11px] font-medium text-fg-caption">
          {tasks.length}
        </span>
        <button
          onClick={() => onAdd(status)}
          aria-label={`Add task to ${meta.label}`}
          className="ml-auto grid size-5 place-items-center rounded text-fg-caption
                     transition-colors duration-[50ms] hover:bg-bg-subtle hover:text-fg-body"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-1.5 rounded-lg p-1.5",
          "transition-colors duration-100",
          isOver ? "bg-bg-inset" : "bg-bg-raised/60",
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <SortableCard key={task.id} task={task} onEdit={onEdit} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <button
            onClick={() => onAdd(status)}
            className="flex h-[68px] items-center justify-center rounded-lg text-[12px] text-fg-caption
                       shadow-[inset_0_0_0_1px_var(--stroke-weak)]
                       transition-colors duration-[50ms] hover:bg-bg-subtle hover:text-fg-muted"
          >
            Drop a task here
          </button>
        )}
      </div>
    </div>
  );
}

export function TaskBoard({ tasks }: { tasks: Task[] }) {
  const { editTask, newTask } = useShell();
  const [columns, setColumns] = useState<Columns>(() => group(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);

  // Server data wins whenever it changes — after a router.refresh(), an edit,
  // or a calendar sync. This is React's "adjust state during render" pattern
  // rather than a syncing effect: it re-renders immediately with the new value
  // instead of painting stale columns first and correcting on the next pass.
  const [renderedFrom, setRenderedFrom] = useState(tasks);
  if (renderedFrom !== tasks) {
    setRenderedFrom(tasks);
    setColumns(group(tasks));
  }

  const sensors = useSensors(
    // A few pixels of slop so a click on a card still opens the editor rather
    // than starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeTask = useMemo(
    () =>
      activeId
        ? Object.values(columns).flat().find((t) => t.id === activeId) ?? null
        : null,
    [activeId, columns],
  );

  const columnOf = (id: string): TaskStatus | null => {
    if (id.startsWith("column:")) return id.slice(7) as TaskStatus;
    for (const status of STATUS_ORDER) {
      if (columns[status].some((t) => t.id === id)) return status;
    }
    return null;
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  /** Move the card between columns live, so the board reflows under the cursor. */
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;

    const from = columnOf(String(active.id));
    const to = columnOf(String(over.id));
    if (!from || !to || from === to) return;

    setColumns((prev) => {
      const moving = prev[from].find((t) => t.id === active.id);
      if (!moving) return prev;

      const overIndex = prev[to].findIndex((t) => t.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : prev[to].length;

      return {
        ...prev,
        [from]: prev[from].filter((t) => t.id !== active.id),
        [to]: [
          ...prev[to].slice(0, insertAt),
          { ...moving, status: to },
          ...prev[to].slice(insertAt),
        ],
      };
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const status = columnOf(String(over.id)) ?? columnOf(String(active.id));
    if (!status) return;

    const list = columns[status];
    const oldIndex = list.findIndex((t) => t.id === active.id);
    const overIndex = list.findIndex((t) => t.id === over.id);
    const newIndex = overIndex >= 0 ? overIndex : list.length - 1;
    if (oldIndex < 0) return;

    const reordered = oldIndex === newIndex ? list : arrayMove(list, oldIndex, newIndex);
    const finalIndex = reordered.findIndex((t) => t.id === active.id);

    // Fractional index between the new neighbours — only this row is written.
    const sortOrder = midpoint(
      reordered[finalIndex - 1]?.sort_order ?? null,
      reordered[finalIndex + 1]?.sort_order ?? null,
    );

    const moved = { ...reordered[finalIndex], status, sort_order: sortOrder };
    const optimistic: Columns = {
      ...columns,
      [status]: reordered.map((t) => (t.id === moved.id ? moved : t)),
    };
    setColumns(optimistic);

    void moveTask(moved.id, status, sortOrder).then((result) => {
      if (!result.ok) {
        toast.error(result.error);
        setColumns(group(tasks)); // snap back to server truth
      }
    });
  };

  return (
    <DndContext
      // Without an explicit id, dnd-kit numbers its aria-describedby targets
      // from a module counter that starts at a different value on the server
      // than in the browser, which trips a hydration mismatch on every load.
      id="furnace-task-board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-full gap-3 overflow-x-auto px-4 py-3">
        {STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={columns[status]}
            onEdit={editTask}
            onAdd={newTask}
          />
        ))}
        {/* Scroll containers drop their trailing padding; this restores it so
            the last column never sits flush against the viewport edge. */}
        <div aria-hidden className="w-px shrink-0" />
      </div>

      {/* The lifted card follows the cursor at a slight tilt. */}
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,0,0,1)" }}>
        {activeTask && (
          <div className="rotate-[1.5deg] cursor-grabbing">
            <TaskCard task={activeTask} className="surface-e4" />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
