"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
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
import { useHydrated } from "@/lib/use-hydrated";
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

type When = "past" | "upcoming" | "all";

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
   *
   * Held in the URL rather than component state. Opening a meeting and coming
   * back remounts this view, and local state would snap to Past — leaving the
   * reader staring at a list that pointedly excludes the meeting they just
   * came from. That was harmless when the default showed everything; it isn't
   * now that the default hides a subset.
   */
  const searchParams = useSearchParams();
  const whenParam = searchParams.get("when");
  const when: When = whenParam === "upcoming" || whenParam === "all" ? whenParam : "past";

  /*
   * Built from the current pathname rather than a hardcoded "/meetings": this
   * view shouldn't teleport the reader to a different route just because they
   * changed a tab, and hardcoding meant it navigated away from wherever it was
   * actually mounted.
   */
  const pathname = usePathname();
  const setWhen = (next: When) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "past") params.delete("when");
    else params.set("when", next);
    const query = params.toString();
    /*
     * typedRoutes can't verify a path assembled at runtime. The cast is the
     * documented escape hatch; the value is this component's own pathname with
     * a query appended, so there's no route here to get wrong.
     */
    router.replace((query ? `${pathname}?${query}` : pathname) as Route, {
      scroll: false,
    });
  };
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
  const hydrated = useHydrated();
  const [clock, setClock] = useState(now);

  /*
   * Adopt a newer server clock when one arrives. `useState(now)` alone latches
   * the mount-time value, so after sync()'s router.refresh() the list would go
   * on classifying against a stale instant until the next tick — and a meeting
   * that started in between would be filed Upcoming and vanish from the default
   * tab. Adjust-during-render rather than an effect, so it lands in the same
   * pass instead of painting the wrong answer first.
   */
  const [seenServerClock, setSeenServerClock] = useState(now);
  if (seenServerClock !== now) {
    /*
     * Unconditional, deliberately. Taking the newer of the two turns the local
     * clock into a ratchet: a laptop that reads twenty minutes fast for a few
     * seconds after resuming from suspend latches that value, and every correct
     * server clock afterwards loses the comparison and is discarded for the life
     * of the tab. The server's answer wins whenever it arrives; the tick's
     * Math.max only guards against a slow machine *between* server renders.
     */
    setSeenServerClock(now);
    setClock(now);
  }

  useEffect(() => {
    // Monotonic: a machine running a few minutes slow would otherwise rewind
    // past the server clock, and a meeting created seconds ago by "Paste
    // transcript" would file itself Upcoming and disappear from this tab.
    const tick = () => setClock((current) => Math.max(current, Date.now()));

    /*
     * Immediately, not just every minute. Next serves back/forward navigations
     * from the Router Cache, so remounting this view can hand it a `now` from
     * twenty minutes ago — and the render-phase guard won't catch it, because
     * the prop didn't change. Without this, a meeting that started a quarter of
     * an hour ago stays hidden from the default tab until the first interval.
     */
    tick();

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

  /*
   * One rule for everything: a meeting is upcoming until it starts.
   *
   * Earlier versions special-cased all-day events, which Google stores as bare
   * dates (UTC midnight). Every attempt to detect them from the timestamps
   * alone misfired on real meetings — a start on UTC midnight is also 5pm PDT
   * and 9am Tokyo, and requiring both ends on midnight still catches a
   * midnight-to-midnight block booked from London. Each version buried genuine
   * meetings, which are the ones that actually carry transcripts, to spare a
   * birthday reminder from showing up a few hours early.
   *
   * The known cost, stated plainly: an all-day event flips to Past at UTC
   * midnight, which west of UTC is the previous evening. That is cosmetic, it
   * is the same answer on the server and in the browser, and it cannot hide a
   * meeting you actually attended. Getting this genuinely right needs the
   * distinction recorded at sync time — Google hands us `start.date` versus
   * `start.dateTime` and we currently throw that away — not another guess here.
   */
  const isUpcoming = (m: Meeting) =>
    Boolean(m.start_time) && new Date(m.start_time as string).getTime() > clock;

  // Counted over everything, not over `visible` — these describe the calendar,
  // not the current filter, and mixing the two produced a header that claimed
  // "3 past" when you had twenty.
  const upcomingCount = meetings.filter(isUpcoming).length;
  const pastCount = meetings.length - upcomingCount;

  /*
   * The count beside it is of ALL upcoming meetings, so the status filter has
   * to come off on the way through — otherwise the button that exists to prove
   * twelve meetings arrived lands on "Nothing matches that filter" and a
   * subtitle reading "0 of 12".
   */
  const showUpcoming = () => {
    setWhen("upcoming");
    setFilter("all");
  };

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
        /*
         * The upcoming count is a button, not a label.
         *
         * Sync pulls three weeks forward while the default tab shows the past,
         * so a sync that genuinely imported a dozen meetings leaves this list
         * visibly unchanged — the toast says "12 new" and nothing appears. The
         * empty-state hint doesn't help either: it only shows when the tab is
         * empty, and anyone with past meetings never sees it. Making the count
         * clickable keeps the way through visible at all times.
         */
        subtitle={
          <>
            {filter !== "all"
              ? `${visible.length} of ${inTab.length}`
              : when === "past"
                ? `${pastCount} past`
                : when === "upcoming"
                  ? `${upcomingCount} upcoming`
                  : `${meetings.length} total`}

            {/*
              * Shown whenever there's something through here, including with a
              * status filter on — gating it on `filter === "all"` meant a user
              * sitting on Past with "No transcript" active could sync, be told
              * "12 new", and be offered no way to see any of them.
              */}
            {when === "past" && upcomingCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <button
                  onClick={showUpcoming}
                  className="rounded text-fg-muted underline decoration-dotted underline-offset-2
                             transition-colors duration-[50ms] hover:text-fg-body"
                >
                  {upcomingCount} upcoming
                </button>
              </>
            )}
          </>
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
            /*
             * Whichever axis emptied the list, offer the way out of that one.
             * Switching to Upcoming with a status filter still on is a real
             * path here — the segmented control deliberately doesn't reset the
             * filter — so "Nothing matches that filter" has to be escapable.
             */
            action={
              inTab.length > 0 ? (
                <Button size="sm" onClick={() => setFilter("all")}>
                  Clear filter
                </Button>
              ) : when === "past" && upcomingCount > 0 ? (
                <Button size="sm" onClick={showUpcoming}>
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
                  /*
                   * The tooltip is absolute and Intl-formatted, so it resolves
                   * in the server's zone during SSR and the reader's afterwards.
                   * Withholding it until hydration is what actually gets the
                   * reader their own timezone: suppressHydrationWarning would
                   * only silence the warning while React left the server's
                   * string in the DOM permanently.
                   */
                  title={hydrated ? formatDateTime(meeting.start_time) : undefined}
                >
                  {meeting.start_time ? relativeTime(meeting.start_time, clock) : "—"}
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
