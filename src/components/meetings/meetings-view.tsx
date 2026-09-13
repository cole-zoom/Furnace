"use client";

import { useEffect, useState, useTransition } from "react";
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
  now,
}: {
  meetings: Meeting[];
  openActionCounts: Record<string, number>;
  /** Epoch ms, resolved on the server: correct on first paint, no hydration gap. */
  now: number;
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
   * The server value seeds it; a timer keeps it honest. Without the tick, a tab
   * left open overnight still holds yesterday's timestamp, so a meeting that
   * started twelve hours ago sits under Upcoming — hidden from the default tab,
   * which is the burial this whole feature exists to prevent. Cheap: one
   * setState a minute, and only when the tab is actually visible.
   */
  const [clock, setClock] = useState(now);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    const id = setInterval(tick, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const isUpcoming = (m: Meeting) => {
    if (!m.start_time) return false;
    const start = new Date(m.start_time);

    /*
     * Google stores an all-day event as a bare date, which Postgres reads as
     * UTC midnight. Anywhere west of UTC that lands the previous evening, so a
     * straight comparison files today's all-day event under Past before the day
     * it belongs to has even started. Compare calendar days for those.
     */
    const isAllDay =
      start.getUTCHours() === 0 &&
      start.getUTCMinutes() === 0 &&
      start.getUTCSeconds() === 0;

    if (isAllDay) {
      const today = new Date(clock);
      const localDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      return start.toISOString().slice(0, 10) > localDay;
    }

    return start.getTime() > clock;
  };

  // Counted over everything, not over `visible` — these describe the calendar,
  // not the current filter, and mixing the two produced a header that claimed
  // "3 past" when you had twenty.
  const upcomingCount = meetings.filter(isUpcoming).length;
  const pastCount = meetings.length - upcomingCount;

  // Split the two axes: knowing how many survive the time tab alone is what
  // lets the empty state name the right culprit.
  const inTab = meetings.filter((m) => {
    if (when === "past") return !isUpcoming(m);
    if (when === "upcoming") return isUpcoming(m);
    return true;
  });

  const matching = inTab.filter((m) => {
    if (filter === "summarised") return m.ai_status === "complete";
    if (filter === "needs-transcript") return !m.transcript;
    return true;
  });

  /*
   * The page orders newest-first, which is right for Past — but left Upcoming
   * showing the meeting three weeks out at the top and tomorrow's at the
   * bottom. Soonest-first is the only sensible reading of "upcoming".
   */
  const visible =
    when === "upcoming"
      ? [...matching].sort(
          (a, b) =>
            new Date(a.start_time ?? 0).getTime() - new Date(b.start_time ?? 0).getTime(),
        )
      : matching;

  return (
    <>
      <PageHeader
        title="Meetings"
        /*
         * With a status filter on, the denominator is the current tab — not the
         * whole calendar. "2 of 50" when 48 of that 50 can't appear under this
         * tab is the same lying count an earlier round set out to fix.
         */
        subtitle={
          filter !== "all"
            ? `${visible.length} of ${inTab.length}`
            : when === "past" && upcomingCount > 0
              ? `${pastCount} past · ${upcomingCount} upcoming`
              : when === "upcoming"
                ? `${upcomingCount} upcoming`
                : `${meetings.length} total`
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
            /*
             * Two axes can empty this list, so name the one that did. If the tab
             * still holds meetings, the status filter hid them; if the tab is
             * empty, the filter is irrelevant and the way out is the other tab —
             * which means the escape hatch must NOT be gated on the filter.
             */
            title={
              inTab.length > 0
                ? "Nothing matches that filter"
                : when === "past"
                  ? "No past meetings yet"
                  : when === "upcoming"
                    ? "Nothing on the calendar ahead"
                    : "No meetings yet"
            }
            description={
              inTab.length === 0 && when === "past" && upcomingCount > 0
                ? `You have ${upcomingCount} upcoming — they'll show up here once they've happened.`
                : undefined
            }
            action={
              inTab.length === 0 && when === "past" && upcomingCount > 0 ? (
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
