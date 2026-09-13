"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  FileText,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, useShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Chip, Kbd } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import type { Meeting } from "@/lib/database.types";

const AI_STATUS: Record<
  Meeting["ai_status"],
  { label: string; tone: "neutral" | "blue" | "ember" | "success" | "danger" } | null
> = {
  pending: null,
  processing: { label: "Summarising…", tone: "blue" },
  complete: { label: "Summarised", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export function MeetingsView({
  meetings,
  openActionCounts,
}: {
  meetings: Meeting[];
  openActionCounts: Record<string, number>;
}) {
  const { pasteTranscript } = useShell();
  const router = useRouter();
  const [syncing, startSync] = useTransition();
  /*
   * Past by default. Calendar sync pulls three weeks forward, so without this
   * the list opens on meetings that haven't happened and can't have a
   * transcript yet — burying the ones you actually want to write up.
   */
  const [when, setWhen] = useState<"past" | "upcoming" | "all">("past");
  const [filter, setFilter] = useState<"all" | "summarised" | "needs-transcript">("all");

  const sync = () =>
    startSync(async () => {
      const pending = toast.loading("Syncing Google Calendar…");
      try {
        const res = await fetch("/api/calendar/sync", { method: "POST" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? body.error ?? "Sync failed");

        toast.success(
          `${body.created} new · ${body.updated} updated · ${body.people} people`,
          { id: pending },
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Sync failed", { id: pending });
      }
    });

  /*
   * "Now" is read once, in a lazy initializer, rather than on every render —
   * a clock read in the render body is impure, and a value that drifts between
   * renders would let a meeting silently change which tab it belongs to
   * mid-interaction. It re-reads whenever the route refreshes, which is exactly
   * when the data behind it changes anyway.
   */
  const [now] = useState(() => Date.now());
  const isUpcoming = (m: Meeting) =>
    Boolean(m.start_time) && new Date(m.start_time as string).getTime() > now;

  const upcomingCount = meetings.filter(isUpcoming).length;

  const visible = meetings.filter((m) => {
    if (when === "past" && isUpcoming(m)) return false;
    if (when === "upcoming" && !isUpcoming(m)) return false;
    if (filter === "summarised") return m.ai_status === "complete";
    if (filter === "needs-transcript") return !m.transcript;
    return true;
  });

  return (
    <>
      <PageHeader
        title="Meetings"
        subtitle={
          when === "past" && upcomingCount > 0
            ? `${visible.length} past · ${upcomingCount} upcoming`
            : `${visible.length} of ${meetings.length}`
        }
        actions={
          <>
            {/* When it happened, and what state it's in, are different questions. */}
            <div className="flex items-center gap-0.5 rounded-md bg-bg-subtle p-0.5">
              {([
                ["past", "Past"],
                ["upcoming", "Upcoming"],
                ["all", "All"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setWhen(value)}
                  className={cn(
                    "h-6 rounded px-2 text-[12px] font-medium transition-all duration-[50ms]",
                    when === value
                      ? "bg-bg text-fg-body shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                      : "text-fg-caption hover:text-fg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-0.5 rounded-md bg-bg-subtle p-0.5">
              {([
                ["all", "All"],
                ["summarised", "Summarised"],
                ["needs-transcript", "No transcript"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "h-6 rounded px-2 text-[12px] font-medium transition-all duration-[50ms]",
                    filter === value
                      ? "bg-bg text-fg-body shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                      : "text-fg-caption hover:text-fg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <Button size="sm" onClick={sync} loading={syncing}>
              {!syncing && <RefreshCw className="size-3.5" />}
              Sync calendar
            </Button>

            <Button size="sm" variant="primary" onClick={pasteTranscript}>
              <FileText className="size-3.5" />
              Paste transcript
              <Kbd>T</Kbd>
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {meetings.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-4" />}
            title="No meetings yet"
            description="Sync your Google Calendar to pull in what's on the books, or paste a transcript straight from Granola."
            action={
              <div className="flex gap-2">
                <Button size="sm" onClick={sync} loading={syncing}>
                  <RefreshCw className="size-3.5" />
                  Sync calendar
                </Button>
                <Button size="sm" variant="primary" onClick={pasteTranscript}>
                  <FileText className="size-3.5" />
                  Paste transcript
                </Button>
              </div>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-4" />}
            title={
              when === "past"
                ? "No past meetings yet"
                : when === "upcoming"
                  ? "Nothing on the calendar ahead"
                  : "Nothing matches that filter"
            }
            description={
              when === "past" && upcomingCount > 0
                ? `You have ${upcomingCount} upcoming — they'll show up here once they've happened.`
                : undefined
            }
            action={
              when === "past" && upcomingCount > 0 ? (
                <Button size="sm" onClick={() => setWhen("upcoming")}>
                  See upcoming
                </Button>
              ) : undefined
            }
          />
        ) : (
          visible.map((meeting) => {
            const status = AI_STATUS[meeting.ai_status];
            const openActions = openActionCounts[meeting.id] ?? 0;

            return (
              <Link
                key={meeting.id}
                href={`/meetings/${meeting.id}`}
                className="group/row flex items-center gap-3 border-b border-[var(--stroke-weak)] px-4 py-2.5
                           transition-colors duration-[50ms] hover:bg-bg-subtle"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-fg">
                      {meeting.title}
                    </span>
                    {status && <Chip tone={status.tone}>{status.label}</Chip>}
                    {openActions > 0 && (
                      <Chip tone="ember">
                        <Sparkles className="size-2.5" />
                        {openActions} action{openActions === 1 ? "" : "s"}
                      </Chip>
                    )}
                  </div>

                  {meeting.summary ? (
                    <p className="mt-0.5 line-clamp-1 text-[12px] leading-[1.45] text-fg-caption">
                      {meeting.summary}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[12px] text-fg-caption">
                      {meeting.transcript ? "Transcript saved" : "No transcript yet"}
                    </p>
                  )}
                </div>

                {meeting.attendee_emails.length > 0 && (
                  <span className="hidden shrink-0 items-center gap-1 text-[12px] text-fg-caption sm:flex">
                    <Users className="size-3" />
                    {meeting.attendee_emails.length}
                  </span>
                )}

                <span
                  className="w-[120px] shrink-0 text-right text-[12px] text-fg-caption"
                  title={formatDateTime(meeting.start_time)}
                >
                  {meeting.start_time ? relativeTime(meeting.start_time) : "—"}
                </span>

                <ChevronRight className="size-3.5 shrink-0 text-fg-disabled transition-transform duration-[50ms] group-hover/row:translate-x-0.5" />
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
