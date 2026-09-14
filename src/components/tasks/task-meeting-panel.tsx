"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, Check, Lightbulb, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/misc";
import { Chip } from "@/components/ui/badge";
import { Label } from "@/components/ui/field";
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
 * The meeting a task came out of, shown inside the task editor.
 *
 * Tasks are the view this app is actually lived in, so a task promoted from a
 * transcript shouldn't make you leave to remember why it exists. Fetched on
 * open rather than joined into the board query: most tasks have no meeting, and
 * the board would otherwise carry every transcript's summary just to render a
 * list of titles.
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
      <Framed>
        <div className="space-y-2 rounded-lg bg-bg-raised p-3 surface">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </Framed>
    );
  }

  if (state.kind === "error") {
    return (
      <Framed>
        <p className="rounded-lg bg-bg-raised p-3 text-[12px] text-fg-caption surface">
          Couldn&apos;t load the meeting this came from.
        </p>
      </Framed>
    );
  }

  // The meeting was deleted. Nothing to show, and nothing worth a label either.
  if (state.kind === "gone") return null;

  return (
    <Framed>
      <MeetingContextCard meeting={state.meeting} />
    </Framed>
  );
}

/**
 * Owns the "Context" label as well as the card, so a meeting that turns out to
 * be gone doesn't leave a heading floating over empty space.
 */
function Framed({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label>Context</Label>
        <Chip tone="ember">
          <Sparkles className="size-2.5" />
          From a meeting
        </Chip>
      </div>
      {children}
    </div>
  );
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
            {/*
              * Unguarded on purpose: the panel starts in `loading` and only
              * reaches this card after the effect resolves, so it never
              * server-renders and there is no hydration pass to disagree with.
              */}
            <p className="text-[11px] text-fg-caption">{formatDateTime(meeting.start_time)}</p>
          )}
        </div>
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
          className="inline-flex shrink-0 items-center gap-0.5 text-[12px] text-link
                     transition-colors duration-[50ms] hover:text-link-strong"
        >
          Open
          <ArrowUpRight className="size-3" />
        </a>
      </header>

      {!hasInsights ? (
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
