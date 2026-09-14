import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TasksView } from "@/components/tasks/tasks-view";
import { TasksSkeleton } from "@/components/tasks/tasks-skeleton";
import { requestTime } from "@/lib/clock";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // RLS already restricts this to the caller. The explicit user_id filter is
  // belt-and-braces, and it lets Postgres use the (user_id, status, sort_order)
  // index directly rather than filtering after the policy check.
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  return (
    // useSearchParams in TasksView needs a Suspense boundary above it. The
    // fallback must render something — null blanks the page on every refresh.
    <Suspense fallback={<TasksSkeleton />}>
      <TasksView tasks={tasks ?? []} now={requestTime()} />
    </Suspense>
  );
}
