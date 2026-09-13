"use client";

import { createLocalStore } from "@/lib/local-store";

export type TaskViewMode = "board" | "table";

/**
 * Shared so the Suspense fallback can draw the same shape the view will settle
 * into. Skeletons exist to hold the layout still; one that always drew a board
 * would itself cause the jump it's meant to prevent for anyone whose saved view
 * is the table.
 */
export const taskViewStore = createLocalStore<TaskViewMode>(
  "furnace-task-view",
  "board",
  (v) => v === "board" || v === "table",
);
