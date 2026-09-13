"use client";

import { createLocalStore } from "@/lib/local-store";

export type TaskViewMode = "board" | "table";

/**
 * Shared so the Suspense fallback can draw the same shape the view will settle
 * into — a skeleton that always drew a board would itself cause the jump it
 * exists to prevent, for anyone whose saved view is the table.
 *
 * Worth being precise about the limit: `useSyncExternalStore` uses the *server*
 * snapshot for SSR and for the hydration render, and localStorage isn't
 * readable there, so a server-rendered fallback still shows the board. This
 * only pays off on client-side navigations and refreshes, which is where the
 * fallback is actually seen. Fixing the SSR case too would mean mirroring the
 * preference into a cookie — not worth it for a flash that only a first hard
 * load can produce.
 */
export const taskViewStore = createLocalStore<TaskViewMode>(
  "furnace-task-view",
  "board",
  (v) => v === "board" || v === "table",
);
