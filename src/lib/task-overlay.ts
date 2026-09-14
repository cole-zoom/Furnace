"use client";

import type { Task } from "@/lib/database.types";

/** The columns the client can write, and therefore the ones worth overlaying. */
export type TaskPatch = Partial<
  Pick<Task, "title" | "description" | "status" | "priority" | "due_date">
>;

export const TASK_PATCH_KEYS = [
  "title",
  "description",
  "status",
  "priority",
  "due_date",
] as const;

const KEYS = TASK_PATCH_KEYS;

type Overlay = Readonly<Record<string, TaskPatch>>;

/**
 * What the client has already written but hasn't seen come back yet.
 *
 * The board's data is server-rendered, so a save doesn't reach it until
 * `router.refresh()` completes a round trip. That gap is small but not
 * invisible: close a task a moment after typing and reopen it straight away,
 * and the editor reseeds from the row the board still holds — showing the text
 * you just wrote being gone. It doesn't even self-correct, because the dialog
 * seeds once at mount, so the stale copy stays for as long as it's open.
 *
 * So a successful write is recorded here and laid over the server's rows until
 * the server agrees. Deliberately module state rather than localStorage: it
 * describes a request this tab has in flight, and a reload should trust the
 * database instead of a note this tab left itself.
 */
const EMPTY: Overlay = Object.freeze({});

let overlay: Overlay = EMPTY;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export const taskOverlay = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },

  get: () => overlay,

  /** SSR and the hydration render see the server's rows unmodified. */
  getServer: () => EMPTY,

  /** Remember a write that landed, so the UI can show it before the refetch does. */
  record(id: string, patch: TaskPatch) {
    if (Object.keys(patch).length === 0) return;
    overlay = { ...overlay, [id]: { ...overlay[id], ...patch } };
    notify();
  },

  /** Forget a row entirely — nothing to overlay once it's deleted. */
  forget(id: string) {
    if (!(id in overlay)) return;
    const next = { ...overlay };
    delete next[id];
    overlay = Object.keys(next).length > 0 ? next : EMPTY;
    notify();
  },

  /**
   * Drop whatever the server has caught up on.
   *
   * Without this an overlay would outlive its purpose and start doing harm —
   * masking a later change to the same column made anywhere else. Convergence
   * is the right expiry, not a timer: the entry exists precisely because the
   * server hadn't caught up, so it should vanish the moment it has.
   */
  reconcile(tasks: readonly Task[]) {
    if (overlay === EMPTY) return;

    const byId = new Map(tasks.map((task) => [task.id, task]));
    const next: Record<string, TaskPatch> = {};
    let changed = false;

    for (const [id, patch] of Object.entries(overlay)) {
      const server = byId.get(id);
      if (!server) {
        // Gone from the server's list — deleted, or filtered out of this page.
        changed = true;
        continue;
      }

      const remaining: TaskPatch = {};
      for (const key of KEYS) {
        if (!(key in patch)) continue;
        if (server[key] === patch[key]) {
          changed = true;
          continue;
        }
        (remaining as Record<string, unknown>)[key] = patch[key];
      }

      if (Object.keys(remaining).length > 0) next[id] = remaining;
    }

    if (!changed) return;
    overlay = Object.keys(next).length > 0 ? next : EMPTY;
    notify();
  },
};

/**
 * Server rows with any un-landed writes laid on top.
 *
 * Returns the original array untouched when there's nothing to overlay — which
 * is almost always. That matters beyond speed: the board resyncs its column
 * state whenever this array's identity changes, so handing back a fresh copy
 * every render would throw away a drag in progress.
 */
export function applyOverlay(tasks: Task[], current: Overlay): Task[] {
  if (current === EMPTY) return tasks;
  return tasks.map((task) => (current[task.id] ? { ...task, ...current[task.id] } : task));
}
