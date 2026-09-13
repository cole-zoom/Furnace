import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MeetingsView } from "@/components/meetings/meetings-view";
import { requestTime } from "@/lib/clock";

export const metadata: Metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: meetings }, { data: actions }] = await Promise.all([
    supabase
      .from("meetings")
      .select("*")
      .eq("user_id", user.id)
      .order("start_time", { ascending: false, nullsFirst: false }),
    // Only unpromoted, undismissed items count as "still needs your attention".
    supabase
      .from("actions")
      .select("meeting_id")
      .eq("user_id", user.id)
      .is("task_id", null)
      .eq("dismissed", false),
  ]);

  const openActionCounts = (actions ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.meeting_id] = (acc[row.meeting_id] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <MeetingsView
      meetings={meetings ?? []}
      openActionCounts={openActionCounts}
      /*
       * The clock comes from the server, not the client. Reading it during
       * render is impure, and freezing it at mount would leave a meeting that
       * has since started sitting in "Upcoming" — hidden from the default tab,
       * which is the exact burial this feature exists to prevent. This page is
       * dynamic, so every navigation and every router.refresh() re-renders it
       * with a fresh value.
       */
      now={requestTime()}
    />
  );
}
