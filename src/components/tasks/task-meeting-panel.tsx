"use client";

import { useEffect, useId, useState } from "react";
import { ArrowUpRight, CalendarDays, Check, ChevronRight, Lightbulb } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/misc";
import { cn, formatDateTime } from "@/lib/utils";
import type { Meeting } from "@/lib/database.types";

/*
 * Deliberately omits `transcript`. It's only ever needed as a yes/no, and it
 * can hold half a megabyte of raw text — shipping that to the browser to choose
 * between two short sentences would undo the whole reason this is a separate
 * fetch. `ai_status` answers the same question.
 */
export type MeetingContext = Pick<
  Meeting,
  "id" | "title" | "start_time" | "summary" | "key_points" | "decisions" | "ai_status"
>;

const SELECT = "id, title, start_time, summary, key_points, decisions, ai_status";

type State =
  | { kind: "loading" }
  | { kind: "ready"; meeting: MeetingContext }
  | { kind: "gone" }
  | { kind: "error" };

/**
 * The meeting a task came out of, embedded in the task page as a sub-page.
 *
 * Tasks are the view this app is actually lived in, so a task promoted from a
 * transcript shouldn't make you leave to remember why it exists. But a full
 * transcript summary is longer than most tasks will ever be, and rendering it
 * expanded pushed the task's own title and description off the screen — the
 * context outweighed the thing it was context *for*. So it collapses to a
 * single row, the way a Notion sub-page does, and opens when asked.
 *
 * Fetched on open rather than joined into the board query: most tasks have no
 * meeting, and the board would otherwise carry every transcript's summary just
 * to render a list of titles.
 *
 * Read with the browser client, so RLS scopes it — a meeting id that isn't
 * yours returns nothing rather than someone else's notes.
 */
export function TaskMeetingPanel({ meetingId }: { meetingId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("meetings")
        .select(SELECT)
        .eq("id", meetingId)
        .maybeSingle();

      if (cancelled) return;

      // A failed request and a deleted meeting both yield no row. Telling them
      // apart matters: one is worth reporting, the other is just history.
      if (error) {
        console.error("[furnace] could not load meeting context:", error.message);
        setState({ kind: "error" });
        return;
      }

      // No cast: the typed client infers the row from the select literal, so a
      // column dropped from SELECT becomes a compile error here rather than a
      // TypeError on `.length` inside the dialog.
      setState(data ? { kind: "ready", meeting: data } : { kind: "gone" });
    })();

    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  if (state.kind === "loading") {
    return (
      <Shell>
        <div className="flex items-center gap-2 px-2.5 py-2">
          <Skeleton className="size-3.5 rounded" />
          <Skeleton className="h-3 w-44" />
        </div>
      </Shell>
    );
  }

  if (state.kind === "error") {
    return (
      <Shell>
        <p className="px-2.5 py-2 text-[12px] text-fg-caption">
          Couldn&apos;t load the meeting this came from.
        </p>
      </Shell>
    );
  }

  // The meeting was deleted. Nothing to show, and nothing worth a frame either.
  if (state.kind === "gone") return null;

  return <MeetingSubPage meeting={state.meeting} />;
}

/** The nested-page frame, so every state sits in the same box at the same size. */
function Shell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg bg-bg-raised surface", className)}>{children}</div>
  );
}

/**
 * Presentation only, so it can be rendered without a session behind it.
 *
 * Collapsed by default — see the note on TaskMeetingPanel. The disclosure is a
 * button rather than <details>/<summary> because the "Open" link has to live in
 * the same row without a click on it also toggling the section.
 */
export function MeetingSubPage({ meeting }: { meeting: MeetingContext }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <Shell>
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left
                     transition-colors duration-[50ms] hover:bg-bg-subtle
                     focus-visible:outline-none focus-visible:surface-accent"
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-fg-caption transition-transform duration-100",
              open && "rotate-90",
            )}
          />
          <CalendarDays className="size-3.5 shrink-0 text-[var(--ember)]" />
          <span className="truncate text-[13px] font-medium text-fg">{meeting.title}</span>
          {/*
            * formatDateTime is unguarded here on purpose: the dialog this lives
            * in renders through a portal that bails on the server, so there is
            * no hydration pass for a timezone-dependent string to disagree
            * with. Elsewhere the same call has to wait for useHydrated.
            */}
          {meeting.start_time && (
            <span className="hidden shrink-0 text-[11px] text-fg-caption sm:inline">
              {formatDateTime(meeting.start_time)}
            </span>
          )}
        </button>

        {/*
          * Opens in a new tab, deliberately.
          *
          * Navigating in place meant closing the dialog — AppShell lives in the
          * (app) layout and survives client-side navigation, so leaving it open
          * stranded the overlay, scroll lock and focus trap on top of the
          * meeting page. But closing it threw away whatever had been typed into
          * the task, with no prompt. And because next/link runs onClick before
          * its own modified-event check, a ⌘-click discarded the edits while
          * opening a background tab — losing work in exchange for nothing.
          *
          * A new tab sidesteps all three: the editor stays exactly as it was.
          */}
        <a
          href={`/meetings/${meeting.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-[12px]
                     text-link transition-colors duration-[50ms]
                     hover:bg-bg-subtle hover:text-link-strong"
        >
          Open
          <ArrowUpRight className="size-3" />
        </a>
      </div>

      {open && (
        <div
          id={bodyId}
          /*
           * 56px of left padding is not arbitrary: it's the chevron, the icon
           * and their two gaps, so the summary starts on the same vertical as
           * the meeting title above it rather than half-indented under it.
           */
          className="border-t border-[var(--stroke-weak)] py-2.5 pl-[56px] pr-3"
        >
          <MeetingInsights meeting={meeting} />
        </div>
      )}
    </Shell>
  );
}

function MeetingInsights({ meeting }: { meeting: MeetingContext }) {
  const hasInsights =
    Boolean(meeting.summary) || meeting.key_points.length > 0 || meeting.decisions.length > 0;

  if (!hasInsights) {
    return (
      <p className="text-[12px] leading-[1.5] text-fg-caption">
        {/*
          * Phrased off ai_status, which is the thing actually known here.
          * "complete" with nothing to show is reachable — a thin or garbled
          * transcript can summarise to an empty string — and telling that
          * user to paste a transcript they already pasted is just wrong.
          */}
        {meeting.ai_status === "failed"
          ? "The transcript couldn't be summarised. Open the meeting to retry."
          : meeting.ai_status === "processing"
            ? "Summarising the transcript…"
            : meeting.ai_status === "complete"
              ? "Summarised, but nothing substantial came back."
              : "No transcript yet — paste one on the meeting to get a summary."}
      </p>
    );
  }

  return (
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
