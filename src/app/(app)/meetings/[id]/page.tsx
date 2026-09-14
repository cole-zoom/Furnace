import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MeetingDetail } from "@/components/meetings/meeting-detail";
import { requestTime } from "@/lib/clock";

// Next 16: route params arrive as a Promise.
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ when?: string; filter?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("meetings")
    .select("title")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  return { title: data?.title ?? "Meeting" };
}

export default async function MeetingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { when, filter } = await searchParams;

  /*
   * Where the back arrow should go. The list keeps its tab and status filter in
   * the URL, so a meeting opened from Upcoming has to return there — plain
   * "/meetings" drops the reader onto Past, a list that by definition excludes
   * the meeting they were just looking at, and silently widens whatever they
   * had narrowed.
   *
   * Both values are allowlisted rather than echoed, so nothing arbitrary from
   * the query string reaches a redirect.
   */
  const backParams = new URLSearchParams();
  if (when === "upcoming" || when === "all") backParams.set("when", when);
  if (filter === "summarised" || filter === "needs-transcript") {
    backParams.set("filter", filter);
  }
  const backQuery = backParams.toString();
  const backTo = backQuery ? `/meetings?${backQuery}` : "/meetings";
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: meeting }, { data: actions }] = await Promise.all([
    supabase
      .from("meetings")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("actions")
      .select("*")
      .eq("meeting_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  // 404 rather than 403 — confirming a row exists but isn't yours is itself a
  // small information leak.
  if (!meeting) notFound();

  return (
    <MeetingDetail
      meeting={meeting}
      actions={actions ?? []}
      backTo={backTo}
      now={requestTime()}
    />
  );
}
