"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Check, Lightbulb, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/misc";
import { Chip } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
import type { Meeting } from "@/lib/database.types";

export type MeetingContext = Pick<
  Meeting,
  "id" | "title" | "start_time" | "summary" | "key_points" | "decisions" | "ai_status" | "transcript"
>;

/**
 * The meeting a task came out of, shown inside the task editor.
 *
 * Tasks are the view this app is actually lived in, so a task promoted from a
 * transcript shouldn't make you leave to remember why it exists. Fetched on
 * open rather than joined into the board query: most tasks have no meeting, and
 * the board would otherwise carry every transcript's worth of summary text just
 * to render a list of titles.
 *
 * Read with the browser client, so RLS scopes it — a meeting id that isn't
 * yours returns nothing rather than someone else's notes.
 */
export function TaskMeetingPanel({ meetingId }: { meetingId: string }) {
  const [meeting, setMeeting] = useState<MeetingContext | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("meetings")
        .select("id, title, start_time, summary, key_points, decisions, ai_status, transcript")
        .eq("id", meetingId)
        .maybeSingle();

      if (cancelled) return;
      if (!data) {
        setState("missing");
        return;
      }
      setMeeting(data as MeetingContext);
      setState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  if (state === "loading") {
    return (
      <section className="space-y-2 rounded-lg bg-bg-raised p-3 surface">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </section>
    );
  }

  // The meeting was deleted, or never belonged to this user. Either way there's
  // nothing to show and nothing worth alarming anyone about.
  if (state === "missing" || !meeting) return null;

  return <MeetingContextCard meeting={meeting} />;
}

/** Presentation only, so it can be rendered without a session behind it. */
export function MeetingContextCard({ meeting }: { meeting: MeetingContext }) {
  const hasInsights =
    Boolean(meeting.summary) || meeting.key_points.length > 0 || meeting.decisions.length > 0;

  return (
    <section className="space-y-2.5 rounded-lg bg-bg-raised p-3 surface">
      <header className="flex items-start gap-2">
        <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-fg-caption" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-fg">{meeting.title}</p>
          {meeting.start_time && (
            <p className="text-[11px] text-fg-caption">{formatDateTime(meeting.start_time)}</p>
          )}
        </div>
        <Link
          href={`/meetings/${meeting.id}`}
          className="inline-flex shrink-0 items-center gap-0.5 text-[12px] text-link
                     transition-colors duration-[50ms] hover:text-link-strong"
        >
          Open
          <ArrowUpRight className="size-3" />
        </Link>
      </header>

      {!hasInsights ? (
        <p className="text-[12px] leading-[1.5] text-fg-caption">
          {meeting.transcript
            ? meeting.ai_status === "failed"
              ? "The transcript couldn't be summarised. Open the meeting to retry."
              : "Transcript saved, no summary yet."
            : "No transcript yet — paste one on the meeting to get a summary."}
        </p>
      ) : (
        <div className="space-y-2.5">
          {meeting.summary && (
            <p className="text-[12px] leading-[1.55] text-fg-body">{meeting.summary}</p>
          )}

          {meeting.key_points.length > 0 && (
            <Section icon={<Lightbulb className="size-3" />} label="Key points">
              {meeting.key_points.map((point, i) => (
                <li key={i} className="flex gap-1.5 text-[12px] leading-[1.5] text-fg-muted">
                  <span className="mt-[6px] size-1 shrink-0 rounded-full bg-fg-caption" />
                  {point}
                </li>
              ))}
            </Section>
          )}

          {meeting.decisions.length > 0 && (
            <Section icon={<Check className="size-3" />} label="Decisions">
              {meeting.decisions.map((decision, i) => (
                <li
                  key={i}
                  className="flex gap-1.5 rounded bg-blue-500/[.06] px-2 py-1 text-[12px] leading-[1.5] text-fg-body"
                >
                  <Check className="mt-[3px] size-3 shrink-0 text-link" />
                  {decision}
                </li>
              ))}
            </Section>
          )}
        </div>
      )}
    </section>
  );
}

function Section({
  icon,
  label,
  children,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.055em] text-fg-subtle">
        {icon}
        {label}
      </p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

/** Small marker for the dialog header when a task came from a meeting. */
export function FromMeetingChip() {
  return (
    <Chip tone="ember">
      <Sparkles className="size-2.5" />
      From a meeting
    </Chip>
  );
}
