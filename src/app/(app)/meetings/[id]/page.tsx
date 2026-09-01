import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MeetingDetail } from "@/components/meetings/meeting-detail";

// Next 16: route params arrive as a Promise.
type Props = { params: Promise<{ id: string }> };

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

export default async function MeetingPage({ params }: Props) {
  const { id } = await params;
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

  return <MeetingDetail meeting={meeting} actions={actions ?? []} />;
}
