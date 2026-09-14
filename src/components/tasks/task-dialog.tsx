"use client";

import { useCallback, useRef, useState, useTransition } from "react";
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
import { useAutosave, type SaveState } from "@/lib/use-autosave";
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

type Draft = ReturnType<typeof seed>;

/** Two seconds of not typing. Long enough that a sentence is one write. */
const AUTOSAVE_DELAY = 2000;

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
 * An existing task saves itself; a new one doesn't. A task being edited is a
 * row that already exists, so a write-behind just keeps it current — the way
 * Notion does, because there is nothing to "cancel" back to that the board
 * isn't already showing. A *new* task has no row at all, and autosaving one
 * would leave a trail of half-typed records behind every time the dialog was
 * opened and abandoned. So creation stays an explicit, single write.
 */
export function TaskDialog({ open, onClose, task, defaultStatus }: TaskDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(() => seed(task, defaultStatus));

  /*
   * Mirrors `form`, so a setter can hand the *next* draft to autosave in the
   * same tick rather than waiting a render for state to settle — which is what
   * makes "change the status, then immediately close" write the new status.
   */
  const formRef = useRef(form);

  const titleRef = useAutosize<HTMLTextAreaElement>(form.title);
  const descriptionRef = useAutosize<HTMLTextAreaElement>(form.description);

  // Focus on an existing title should land the caret at the end, not in front
  // of the text you came to edit. Once only — re-focusing later shouldn't yank
  // the caret away from wherever the user just clicked.
  const caretPlaced = useRef(false);

  // Set only when a request actually goes out. Opening a task to read it — or
  // typing a character and deleting it again — should cost nothing, and that
  // includes the board refetch on the way out.
  const wrote = useRef(false);

  const { state: saveState, schedule, flush, cancel } = useAutosave<Draft>({
    enabled: Boolean(task),
    delay: AUTOSAVE_DELAY,
    // What's already in the database, so the very first diff runs against the
    // truth rather than against an empty draft. Only read once, on mount.
    initial: seed(task, defaultStatus),
    validate: (draft) => (draft.title.trim() ? null : "Needs a title"),
    save: async (draft, previous) => {
      if (!task) return { ok: true };

      // Only the columns that actually moved. An unchanged draft sends nothing
      // at all, so a stray keystroke that gets undone costs zero requests.
      const patch: Record<string, unknown> = {};
      if (draft.title !== previous.title) patch.title = draft.title.trim();
      if (draft.description !== previous.description) {
        patch.description = draft.description.trim() || null;
      }
      if (draft.status !== previous.status) patch.status = draft.status;
      if (draft.priority !== previous.priority) patch.priority = draft.priority;
      if (draft.due_date !== previous.due_date) patch.due_date = draft.due_date || null;

      if (Object.keys(patch).length === 0) return { ok: true };

      const result = await updateTask(task.id, patch);
      // Only a write that *landed* gives the board something new to show. A
      // failed one leaves the row exactly as the board already has it, so
      // refetching on the way out would be a round trip to learn nothing.
      if (result.ok) wrote.current = true;
      return result;
    },
  });

  /**
   * `immediate` for a decision, debounced for typing. Picking a status or a
   * date is one deliberate act and should land at once; prose isn't finished
   * until the typing stops.
   */
  const set = (patch: Partial<Draft>, immediate = false) => {
    const next = { ...formRef.current, ...patch };
    formRef.current = next;
    setForm(next);
    schedule(next, immediate);
  };

  /*
   * Memoised deliberately. Dialog no longer re-runs its effects when a handler
   * changes identity, but this one is also read by an effect there, and a
   * close handler that churns every keystroke is a hazard worth not creating.
   *
   * The ordering is the point. router.refresh() re-reads the row, so it has to
   * wait for everything outstanding — including a request already in the air —
   * or the reader watches their own last sentence get reverted on the board.
   * And it only runs at all if a write actually happened: refetching the whole
   * board after reading a task and closing it is exactly the wasted round trip
   * the debounce exists to avoid.
   */
  const close = useCallback(() => {
    if (!task) {
      onClose();
      return;
    }
    void flush().then((result) => {
      // The dialog is on its way out, taking the inline indicator with it — so
      // anything that didn't persist has to be said somewhere that outlives it.
      if (result.kind === "blocked") toast.error(`Not saved — ${result.reason.toLowerCase()}`);
      else if (result.kind === "error") toast.error(result.message);
      if (wrote.current) router.refresh();
    });
    onClose();
  }, [task, flush, onClose, router]);

  const create = () => {
    if (!form.title.trim()) {
      toast.error("Give the task a title");
      titleRef.current?.focus();
      return;
    }

    startTransition(async () => {
      const result = await createTask({
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Task created");
      onClose();
      router.refresh();
    });
  };

  const remove = () => {
    if (!task) return;
    // Otherwise a debounced write lands two seconds later against a row that
    // no longer exists.
    cancel();
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
      onClose={close}
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
        task ? (
          /*
           * No Cancel on an existing task: the edits are already in the
           * database by the time you get here, so an escape hatch labelled
           * Cancel would be lying about what it does.
           */
          <>
            <Button variant="danger" size="sm" onClick={remove} disabled={pending} className="mr-auto">
              <Trash2 className="size-3.5" />
              Delete
            </Button>
            <Button variant="primary" size="sm" onClick={close} disabled={pending}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={create} loading={pending}>
              Create task
            </Button>
          </>
        )
      }
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        onKeyDown={(e) => {
          // ⌘↵ from anywhere on the page: create it, or — since an edit is
          // already saved — simply leave. Handled once, here, so the fields
          // below can own plain Enter without double-firing.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (task) close();
            else create();
          }
        }}
      >
        {/* Breadcrumb-ish chrome, in place of a title bar the page doesn't want. */}
        <div className="flex shrink-0 items-center justify-between gap-4 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[12px] text-fg-caption">
              {task ? "Task" : "New task"}
            </span>
            {task && <SaveStatus state={saveState} onRetry={() => void flush()} />}
          </div>
          <button
            onClick={close}
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
              onChange={(e) => set({ title: e.target.value })}
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
                <Overlaid label="Status" value={form.status} onChange={(v) => set({ status: v }, true)} options={STATUS_ORDER} optionLabel={(s) => STATUS_META[s].label}>
                  <StatusChip status={form.status} />
                </Overlaid>
              </Property>

              <Property icon={<SignalHigh className="size-3.5" />} label="Priority">
                <Overlaid label="Priority" value={form.priority} onChange={(v) => set({ priority: v }, true)} options={PRIORITY_ORDER} optionLabel={(p) => PRIORITY_META[p].label}>
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
                    onChange={(e) => set({ due_date: e.target.value }, true)}
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
                        onClick={() => set({ due_date: "" }, true)}
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
                onChange={(e) => set({ description: e.target.value })}
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

/**
 * The write-behind, made visible.
 *
 * An autosave you can't see is one you can't trust, and an autosave that fails
 * silently is data loss with extra steps — so the failure state is a button
 * that retries, not a message that sits there. The live region is always
 * mounted so a screen reader hears the transitions instead of only the element
 * appearing.
 */
function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  return (
    <span aria-live="polite" className="min-w-0 truncate text-[12px]">
      {state.kind === "saving" && <span className="text-fg-caption">Saving…</span>}
      {state.kind === "saved" && <span className="text-fg-caption">Saved</span>}
      {state.kind === "blocked" && (
        <span className="text-[var(--warning)]">{state.reason}</span>
      )}
      {state.kind === "error" && (
        <button
          type="button"
          onClick={onRetry}
          className="text-danger underline-offset-2 hover:underline"
        >
          Couldn&apos;t save — retry
        </button>
      )}
    </span>
  );
}

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
