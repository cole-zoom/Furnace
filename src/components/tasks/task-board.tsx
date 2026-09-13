"use client";

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type MouseSensorOptions,
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

/**
 * MouseSensor's stock activator rejects only the right button, so a middle
 * click — or a thumb back/forward button — moving 4px over a card would lift
 * and persist a move. Now that the listeners cover the whole card rather than a
 * small grip, that's easy to trigger by accident, and on Linux middle-click is
 * the primary-selection paste gesture.
 */
class PrimaryMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: "onMouseDown" as const,
      handler: (
        { nativeEvent }: React.MouseEvent,
        { onActivation }: MouseSensorOptions,
      ) => {
        if (nativeEvent.button !== 0) return false;
        // Stock MouseSensor fires this; dropping it would make onActivation
        // silently dead for mouse while still firing for touch and keyboard.
        onActivation?.({ event: nativeEvent });
        return true;
      },
    },
  ];
}

function group(tasks: Task[]): Columns {
  const next: Columns = { todo: [], in_progress: [], blocked: [], done: [] };
  for (const task of tasks) {
    /*
     * hasOwn rather than `next[status] ?? next.todo`: a status colliding with
     * an Object.prototype member ("toString", "constructor") resolves to an
     * inherited function, so `??` never fires and `.push` throws — the exact
     * crash this guard exists to prevent.
     */
    if (Object.hasOwn(next, task.status)) {
      next[task.status].push(task);
    } else {
      console.warn(`[furnace] task ${task.id} has unknown status`, task.status);
      next.todo.push(task);
    }
  }
  for (const status of STATUS_ORDER) {
    next[status].sort((a, b) => a.sort_order - b.sort_order);
  }
  return next;
}

function SortableCard({ task, onEdit }: { task: Task; onEdit: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    /*
     * The listeners live on the whole card, not on a grip, so it can be grabbed
     * anywhere. How a drag starts differs per input, which is the point:
     *   mouse    — 4px of movement, so a plain click still opens the editor
     *   touch    — 220ms press-and-hold, so a swipe pans the board instead
     *   keyboard — Space lifts; Space/Enter/Tab drop. Enter opens the editor
     *                instead when nothing is lifted.
     */
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "cursor-grab touch-manipulation select-none no-callout active:cursor-grabbing",
        isDragging && "z-10",
      )}
      {...attributes}
      {...listeners}
      /*
       * `attributes` makes this a focusable role="button", but the click that
       * opens the editor lives on the inner div, and a div doesn't synthesize
       * click from Enter — so without a handler here there'd be no keyboard
       * path to the editor at all.
       *
       * It MUST delegate rather than replace. KeyboardSensor's activator is
       * carried in `listeners` under this very same `onKeyDown` key, and an
       * explicit prop wins over the spread above it — so returning early for
       * every key silently kills keyboard dragging outright.
       */
      onKeyDown={(event) => {
        /*
         * Enter opens the editor — but only when this card isn't mid-lift,
         * where Enter means "drop it here". Opening a modal over a live drag
         * leaves the keyboard sensor attached, so arrow keys would move the
         * floating card instead of the text caret.
         */
        if (event.key === "Enter" && !isDragging) {
          event.preventDefault();
          onEdit(task);
          return;
        }
        listeners?.onKeyDown?.(event);
      }}
    >
      <TaskCard task={task} dragging={isDragging} onClick={() => onEdit(task)} />
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

  /*
   * Where the card sat when the drag began. onDragOver rewrites `columns`
   * mid-drag, so by the time onDragEnd runs the local indices no longer
   * describe the starting position — comparing against them would call a
   * drag-out-and-back-again a no-op and silently skip a real reorder, leaving
   * the board showing a move that was never saved.
   */
  const origin = useRef<{ status: TaskStatus; index: number } | null>(null);

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
    // Mouse: left button only, with a few pixels of slop so a click still
    // opens the editor.
    useSensor(PrimaryMouseSensor, { activationConstraint: { distance: 4 } }),
    /*
     * Touch: long-press, NOT distance. The board is four 260px columns in a
     * horizontal scroller, so on a phone it has to be panned — and cards cover
     * almost all of that surface. With a distance constraint (plus the
     * touch-action:none it requires) a swipe starting on a card would lift the
     * card instead of scrolling, stranding the Blocked and Done columns
     * offscreen. A delay lets a swipe scroll normally and reserves dragging for
     * a deliberate press-and-hold.
     */
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      /*
       * Only Space *starts* a drag, so Enter stays free to open the editor.
       * All three still END one: Enter because it's the natural "drop", and Tab
       * because otherwise moving focus leaves the card lifted and still
       * tracking arrow keys from the document listener.
       */
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space", "Enter", "Tab"],
      },
    }),
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

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveId(id);
    const from = columnOf(id);
    origin.current = from
      ? { status: from, index: columns[from].findIndex((t) => t.id === id) }
      : null;
  };

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

    /*
     * A drag that ends exactly where it started writes nothing. TouchSensor
     * activates on a 220ms press with no movement requirement, so merely
     * holding a card to read it reaches this point.
     */
    const startedAt = origin.current;
    origin.current = null;
    if (startedAt && startedAt.status === status && startedAt.index === finalIndex) {
      return;
    }

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
      onDragCancel={() => {
        setActiveId(null);
        origin.current = null;
      }}
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
