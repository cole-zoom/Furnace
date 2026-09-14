"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, Circle, SignalHigh, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { TaskMeetingPanel } from "@/components/tasks/task-meeting-panel";
import { Button } from "@/components/ui/button";
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  PriorityBars,
  STATUS_META,
  STATUS_ORDER,
  StatusChip,
} from "@/components/ui/badge";
import { createTask, deleteTask, updateTask } from "@/lib/actions";
import { useAutosize } from "@/lib/use-autosize";
import { cn, dueLabel } from "@/lib/utils";
import type { Task, TaskPriority, TaskStatus } from "@/lib/database.types";

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  /** Omit to create. Provide to edit. */
  task?: Task | null;
  defaultStatus?: TaskStatus;
}

/** Mirrors the database's own limits, so overlong input is stopped at the key. */
const TITLE_MAX = 500;
const DESCRIPTION_MAX = 20_000;

/**
 * Seeded once, at mount. AppShell gives this component a fresh `key` on every
 * open, so each visit remounts with the right values and a stale draft can
 * never leak from one task into the next — no syncing effect needed.
 */
function seed(task: Task | null | undefined, defaultStatus?: TaskStatus) {
  return task
    ? {
        title: task.title,
        description: task.description ?? "",
        status: task.status,
        priority: task.priority,
        due_date: task.due_date ?? "",
      }
    : {
        title: "",
        description: "",
        status: defaultStatus ?? ("todo" as TaskStatus),
        priority: "medium" as TaskPriority,
        due_date: "",
      };
}

/**
 * A task, as a page rather than a form.
 *
 * The old layout stacked five labelled fields, which meant the description —
 * the part a task is actually about — was a three-row box wedged between a
 * text input and a row of selects. Here the title is the page heading, the
 * three attributes sit under it as properties, and the description owns the
 * rest of the page. Nothing about the data changed; the same five columns are
 * read and written by the same two Server Actions.
 *
 * Saving stays explicit. Notion autosaves because its editor owns the document;
 * here every keystroke would be a Server Action round trip against a row the
 * board is also rendering, so Cancel remains a real escape hatch.
 */
export function TaskDialog({ open, onClose, task, defaultStatus }: TaskDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(() => seed(task, defaultStatus));

  const titleRef = useAutosize<HTMLTextAreaElement>(form.title);
  const descriptionRef = useAutosize<HTMLTextAreaElement>(form.description);

  // Focus on an existing title should land the caret at the end, not in front
  // of the text you came to edit. Once only — re-focusing later shouldn't yank
  // the caret away from wherever the user just clicked.
  const caretPlaced = useRef(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    if (!form.title.trim()) {
      toast.error("Give the task a title");
      titleRef.current?.focus();
      return;
    }

    startTransition(async () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
      };

      const result = task
        ? await updateTask(task.id, payload)
        : await createTask(payload);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(task ? "Task updated" : "Task created");
      onClose();
      router.refresh();
    });
  };

  const remove = () => {
    if (!task) return;
    startTransition(async () => {
      const result = await deleteTask(task.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Task deleted");
      onClose();
      router.refresh();
    });
  };

  const due = dueLabel(form.due_date || null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabel={task ? "Edit task" : "New task"}
      /*
       * A page, so: wider, and a fixed height with the scrolling on the inside.
       * Letting the panel grow to its content put a long description's Save
       * button below the fold of the viewport — which is exactly what a meeting
       * summary used to do to this dialog.
       */
      className="mt-[5vh] flex h-[min(82vh,880px)] max-w-3xl flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col p-0"
      footer={
        <>
          {task && (
            <Button variant="danger" size="sm" onClick={remove} disabled={pending} className="mr-auto">
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} loading={pending}>
            {task ? "Save" : "Create task"}
          </Button>
        </>
      }
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        onKeyDown={(e) => {
          // ⌘↵ submits from anywhere on the page. Handled once, here, so the
          // fields below can own plain Enter without double-firing the action.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        {/* Breadcrumb-ish chrome, in place of a title bar the page doesn't want. */}
        <div className="flex shrink-0 items-center justify-between gap-4 px-3 py-2">
          <span className="text-[12px] text-fg-caption">{task ? "Task" : "New task"}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 shrink-0 place-items-center rounded-md text-fg-caption
                       transition-colors duration-[50ms] hover:bg-bg-subtle hover:text-fg-body"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[660px] flex-col px-6 pb-10 pt-2 sm:px-10">
            <textarea
              ref={titleRef}
              data-autofocus
              rows={1}
              maxLength={TITLE_MAX}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              onFocus={(e) => {
                if (caretPlaced.current) return;
                caretPlaced.current = true;
                const end = e.currentTarget.value.length;
                e.currentTarget.setSelectionRange(end, end);
              }}
              onKeyDown={(e) => {
                // A title is one line. Enter moves on to the body, the way it
                // does in any page editor, instead of smuggling a newline into
                // a string the board renders on a single row.
                if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  descriptionRef.current?.focus();
                }
              }}
              placeholder="Untitled"
              aria-label="Title"
              className="w-full resize-none overflow-hidden bg-transparent text-[27px] font-semibold
                         leading-[1.25] tracking-[-0.012em] text-fg outline-none
                         placeholder:text-fg-caption"
            />

            <div className="mt-4 space-y-0.5">
              <Property icon={<Circle className="size-3.5" />} label="Status">
                <Overlaid label="Status" value={form.status} onChange={(v) => set("status", v)} options={STATUS_ORDER} optionLabel={(s) => STATUS_META[s].label}>
                  <StatusChip status={form.status} />
                </Overlaid>
              </Property>

              <Property icon={<SignalHigh className="size-3.5" />} label="Priority">
                <Overlaid label="Priority" value={form.priority} onChange={(v) => set("priority", v)} options={PRIORITY_ORDER} optionLabel={(p) => PRIORITY_META[p].label}>
                  <PriorityBars priority={form.priority} />
                  <span className={cn("text-[13px]", PRIORITY_META[form.priority].chip)}>
                    {PRIORITY_META[form.priority].label}
                  </span>
                </Overlaid>
              </Property>

              <Property icon={<CalendarDays className="size-3.5" />} label="Due">
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="date"
                    aria-label="Due date"
                    value={form.due_date}
                    onChange={(e) => set("due_date", e.target.value)}
                    className="rounded-md bg-transparent px-1.5 py-1 text-[13px] text-fg-body
                               outline-none transition-colors duration-[50ms]
                               hover:bg-bg-subtle focus:surface-accent"
                  />
                  {/*
                    * Relative wording, unguarded by useHydrated: this dialog is
                    * portalled and returns null on the server, so "Tomorrow"
                    * is only ever computed in the reader's own timezone and
                    * there is no server render for it to disagree with.
                    */}
                  {form.due_date && (
                    <>
                      <span className={cn("text-[12px]", DUE_TONE[due.tone])}>{due.label}</span>
                      <button
                        type="button"
                        onClick={() => set("due_date", "")}
                        aria-label="Clear due date"
                        className="grid size-5 place-items-center rounded text-fg-caption
                                   transition-colors duration-[50ms] hover:bg-bg-subtle hover:text-fg-body"
                      >
                        <X className="size-3" />
                      </button>
                    </>
                  )}
                </div>
              </Property>
            </div>

            {/* Why this task exists, one row deep, without leaving the board. */}
            {task?.meeting_id && (
              <div className="mt-3">
                <TaskMeetingPanel meetingId={task.meeting_id} />
              </div>
            )}

            <hr className="my-4 shrink-0 border-0 border-t border-[var(--stroke-weak)]" />

            {/*
              * The rest of the page is the description, and clicking anywhere
              * in the empty space below the text puts the caret in it — the one
              * affordance that makes a text box feel like a page.
              */}
            <div className="flex flex-1 flex-col" onClick={() => descriptionRef.current?.focus()}>
              {/*
                * Sized by `min-h` rather than `flex-1`. A flex child's height is
                * resolved by the container, which would override the height
                * autosize measures out — and with overflow hidden, anything
                * past the container's height would simply be invisible.
                */}
              <textarea
                ref={descriptionRef}
                rows={1}
                maxLength={DESCRIPTION_MAX}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Add detail, links — whatever helps future you."
                aria-label="Description"
                className="w-full min-h-[240px] resize-none overflow-hidden bg-transparent
                           text-[14px] leading-[1.7] text-fg-body outline-none
                           placeholder:text-fg-caption"
              />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

const DUE_TONE: Record<ReturnType<typeof dueLabel>["tone"], string> = {
  overdue: "text-danger",
  today: "text-[var(--warning)]",
  soon: "text-fg-muted",
  later: "text-fg-caption",
  none: "text-fg-caption",
};

/** One Notion-style property line: a quiet label, then the control. */
function Property({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex w-[104px] shrink-0 items-center gap-1.5 pt-[7px] text-[12px] text-fg-subtle">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * A rendered chip with a transparent native `<select>` laid over it.
 *
 * The board's status and priority already have a visual language — a coloured
 * dot, a four-bar meter — and a native select can't render either. Overlaying
 * the real control keeps the keyboard behaviour, the mobile picker and the
 * accessible name that a hand-rolled listbox would have to reimplement, while
 * the thing you actually look at is the same chip the card shows.
 */
function Overlaid<T extends string>({
  label,
  value,
  onChange,
  options,
  optionLabel,
  children,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly T[];
  optionLabel: (value: T) => string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1
                 transition-colors duration-[50ms] hover:bg-bg-subtle focus-within:surface-accent"
    >
      {/* Decoration: the select below is the labelled control. */}
      <span aria-hidden className="pointer-events-none inline-flex items-center gap-1.5">
        {children}
      </span>
      <ChevronDown className="pointer-events-none size-3 shrink-0 text-fg-caption" />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );
}
