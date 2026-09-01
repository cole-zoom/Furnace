"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import type { Meeting, Task, TaskPriority, TaskStatus } from "@/lib/database.types";

/**
 * Server Actions.
 *
 * Every one of these starts by resolving the user itself. That is deliberate
 * and not redundant with proxy.ts: a Server Action is a POST to the page route,
 * so the proxy matcher can skip it, and it can be invoked directly by anyone
 * who knows the action id. The auth check has to live *here*, and RLS has to
 * hold underneath even if this check were somehow missed.
 *
 * Note also that no action accepts a `user_id`. Ownership is always taken from
 * the session and every mutation is additionally scoped `.eq("user_id", …)` so
 * a guessed row id gets a no-op rather than someone else's data.
 */

export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? object : { data: T }))
  | { ok: false; error: string };

async function authed() {
  const user = await getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return { user, supabase: await createClient() };
}

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return { ok: false, error: "Your session expired. Refresh and sign in again." };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? fallback };
  }
  console.error(`[actions] ${fallback}:`, error);
  return { ok: false, error: fallback };
}

const STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

const taskInput = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(500),
  description: z.string().trim().max(20_000).optional().nullable(),
  status: z.enum(STATUSES).default("todo"),
  priority: z.enum(PRIORITIES).default("medium"),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD")
    .nullable()
    .optional(),
  meeting_id: z.uuid().nullable().optional(),
});

// ------------------------------------------------------------------- tasks --

export async function createTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { user, supabase } = await authed();
    const parsed = taskInput.parse(input);

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        title: parsed.title,
        description: parsed.description || null,
        status: parsed.status,
        priority: parsed.priority,
        due_date: parsed.due_date || null,
        meeting_id: parsed.meeting_id || null,
        // Newest first within its column.
        sort_order: Date.now(),
      })
      .select("id")
      .single();

    if (error) throw error;

    revalidatePath("/tasks");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error, "Could not create that task.");
  }
}

export async function updateTask(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const { user, supabase } = await authed();
    z.uuid().parse(id);
    const parsed = taskInput.partial().parse(input);

    const patch: Partial<Task> = {};
    if (parsed.title !== undefined) patch.title = parsed.title;
    if (parsed.description !== undefined) patch.description = parsed.description || null;
    if (parsed.status !== undefined) patch.status = parsed.status;
    if (parsed.priority !== undefined) patch.priority = parsed.priority;
    if (parsed.due_date !== undefined) patch.due_date = parsed.due_date || null;
    if (parsed.meeting_id !== undefined) patch.meeting_id = parsed.meeting_id || null;

    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    revalidatePath("/tasks");
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not save that task.");
  }
}

/**
 * Kanban drop. The caller computes a fractional sort key between the two cards
 * the task landed between, so only this one row is written.
 */
export async function moveTask(
  id: string,
  status: TaskStatus,
  sortOrder: number,
): Promise<ActionResult> {
  try {
    const { user, supabase } = await authed();
    z.uuid().parse(id);
    z.enum(STATUSES).parse(status);
    z.number().finite().parse(sortOrder);

    const { error } = await supabase
      .from("tasks")
      .update({ status, sort_order: sortOrder })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    revalidatePath("/tasks");
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not move that task.");
  }
}

export async function deleteTask(id: string): Promise<ActionResult> {
  try {
    const { user, supabase } = await authed();
    z.uuid().parse(id);

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    revalidatePath("/tasks");
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not delete that task.");
  }
}

export async function setTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<ActionResult> {
  return updateTask(id, { status });
}

export async function setTaskPriority(
  id: string,
  priority: TaskPriority,
): Promise<ActionResult> {
  return updateTask(id, { priority });
}

// ---------------------------------------------------------------- meetings --

const meetingInput = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  transcript: z.string().max(500_000).optional().nullable(),
  notes: z.string().max(50_000).optional().nullable(),
  start_time: z.string().optional().nullable(),
});

export async function createMeeting(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { user, supabase } = await authed();
    const parsed = meetingInput.parse(input);

    const { data, error } = await supabase
      .from("meetings")
      .insert({
        user_id: user.id,
        title: parsed.title?.trim() || "Untitled meeting",
        transcript: parsed.transcript || null,
        notes: parsed.notes || null,
        start_time: parsed.start_time || new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw error;

    revalidatePath("/meetings");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error, "Could not save that meeting.");
  }
}

export async function updateMeeting(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const { user, supabase } = await authed();
    z.uuid().parse(id);
    const parsed = meetingInput.parse(input);

    const patch: Partial<Meeting> = {};
    if (parsed.title !== undefined) patch.title = parsed.title;
    if (parsed.transcript !== undefined) patch.transcript = parsed.transcript;
    if (parsed.notes !== undefined) patch.notes = parsed.notes;
    if (parsed.start_time !== undefined) patch.start_time = parsed.start_time;

    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabase
      .from("meetings")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    revalidatePath("/meetings");
    revalidatePath(`/meetings/${id}`);
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not save that meeting.");
  }
}

export async function deleteMeeting(id: string): Promise<ActionResult> {
  try {
    const { user, supabase } = await authed();
    z.uuid().parse(id);

    const { error } = await supabase
      .from("meetings")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    revalidatePath("/meetings");
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not delete that meeting.");
  }
}

// ----------------------------------------------------------------- actions --

/**
 * Turn an AI-extracted action item into a real task, and link the two so the
 * meeting detail view can show it's already been promoted.
 */
export async function promoteAction(
  actionId: string,
): Promise<ActionResult<{ taskId: string }>> {
  try {
    const { user, supabase } = await authed();
    z.uuid().parse(actionId);

    const { data: action, error: readError } = await supabase
      .from("actions")
      .select("id, description, owner, due_date, meeting_id, task_id")
      .eq("id", actionId)
      .eq("user_id", user.id)
      .single();

    if (readError || !action) throw readError ?? new Error("Action item not found");
    if (action.task_id) return { ok: true, data: { taskId: action.task_id } };

    const { data: task, error: insertError } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        title: action.description.slice(0, 500),
        meeting_id: action.meeting_id,
        due_date: action.due_date,
        description: action.owner ? `Owner: ${action.owner}` : null,
        sort_order: Date.now(),
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    const { error: linkError } = await supabase
      .from("actions")
      .update({ task_id: task.id })
      .eq("id", actionId)
      .eq("user_id", user.id);

    if (linkError) throw linkError;

    revalidatePath("/tasks");
    revalidatePath(`/meetings/${action.meeting_id}`);
    return { ok: true, data: { taskId: task.id } };
  } catch (error) {
    return fail(error, "Could not turn that into a task.");
  }
}

export async function dismissAction(
  actionId: string,
  dismissed = true,
): Promise<ActionResult> {
  try {
    const { user, supabase } = await authed();
    z.uuid().parse(actionId);

    const { error } = await supabase
      .from("actions")
      .update({ dismissed })
      .eq("id", actionId)
      .eq("user_id", user.id);

    if (error) throw error;

    revalidatePath("/meetings");
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not update that action item.");
  }
}

// ------------------------------------------------------------------ people --

export async function updatePerson(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const { user, supabase } = await authed();
    z.uuid().parse(id);

    const parsed = z
      .object({
        full_name: z.string().trim().max(200).nullable().optional(),
        company: z.string().trim().max(200).nullable().optional(),
        role: z.string().trim().max(200).nullable().optional(),
        notes: z.string().max(20_000).nullable().optional(),
      })
      .parse(input);

    const { error } = await supabase
      .from("people")
      .update(parsed)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    revalidatePath("/people");
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not save that contact.");
  }
}
