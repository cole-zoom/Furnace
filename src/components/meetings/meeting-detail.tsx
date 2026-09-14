"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Lightbulb,
  MapPin,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { readJson } from "@/lib/fetch-json";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { Avatar, SectionHeading } from "@/components/ui/misc";
import { Textarea } from "@/components/ui/field";
import { TranscriptDialog } from "@/components/meetings/transcript-dialog";
import {
  deleteMeeting,
  dismissAction,
  promoteAction,
  updateMeeting,
} from "@/lib/actions";
import { cn, dueLabel, formatDateTime } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";
import { useTickingClock } from "@/lib/use-ticking-clock";
import type { Action, Meeting } from "@/lib/database.types";

export function MeetingDetail({
  meeting,
  actions,
  backTo = "/meetings",
  now,
}: {
  meeting: Meeting;
  actions: Action[];
  /** Preserves the list's tab, so back doesn't land on a view that hides this. */
  backTo?: string;
  /** Server-resolved instant, used once the reader's calendar day is known. */
  now: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Bumped on open so the dialog remounts with an empty form each time.
  const [transcriptDialog, setTranscriptDialog] = useState({ open: false, seq: 0 });
  const [showTranscript, setShowTranscript] = useState(false);
  /*
   * Action-item due dates say "Today"/"Tomorrow", which is the reader's calendar
   * day — unknowable until the browser has it, and wrong again by morning if the
   * instant is pinned to the render. A meeting page is exactly the sort of thing
   * left open overnight.
   */
  const hydrated = useHydrated();
  const clock = useTickingClock(now);
  const [resummarising, setResummarising] = useState(false);
  const [notes, setNotes] = useState(meeting.notes ?? "");
  const [savedNotes, setSavedNotes] = useState(meeting.notes ?? "");

  const hasPriorInsights =
    Boolean(meeting.summary) ||
    meeting.key_points.length > 0 ||
    meeting.decisions.length > 0;

  const open = actions.filter((a) => !a.dismissed && !a.task_id);
  const handled = actions.filter((a) => a.dismissed || a.task_id);

  /*
   * Re-run the transcript already on file.
   *
   * The failure copy — here and in the task panel — told people to "open the
   * meeting to retry", but the only control was gated on `!meeting.transcript`
   * and process-meeting keeps the transcript when it marks a run failed. So a
   * failed meeting offered a red error chip and nothing else. A run that dies
   * mid-request is worse: the row sits at "processing" forever with no way out.
   */
  const resummarise = () => {
    if (!meeting.transcript) return;
    setResummarising(true);
    const toastId = toast.loading("Re-reading the transcript…");

    void (async () => {
      try {
        const res = await fetch("/api/process-meeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // No transcript in the body: the row already holds it. Re-uploading
          // it also meant a transcript shorter than the route's 20-char floor
          // came back as a 400 on a retry that should just work.
          body: JSON.stringify({ meetingId: meeting.id }),
        });
        const { ok, data, error } = await readJson<{ actions?: unknown[] }>(res);
        if (!ok) throw new Error(error ?? "Could not process this transcript.");

        const count = data?.actions?.length ?? 0;
        toast.success(
          count > 0 ? `Summarised · ${count} action item${count === 1 ? "" : "s"}` : "Summarised",
          { id: toastId },
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong", { id: toastId });
        /*
         * Refresh on failure too. The route marks the row `processing` before
         * calling Gemini and `failed` afterwards, so without this the page goes
         * on rendering the previous `complete` state — no error chip, the button
         * still offering "Re-summarise", and a stale summary presented as
         * current while the meetings list shows the same row as Failed.
         */
        router.refresh();
      } finally {
        setResummarising(false);
      }
    })();
  };

  const saveNotes = () => {
    if (notes === savedNotes) return;
    startTransition(async () => {
      const result = await updateMeeting(meeting.id, { notes });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSavedNotes(notes);
      toast.success("Notes saved");
    });
  };

  const promote = (action: Action) =>
    startTransition(async () => {
      const result = await promoteAction(action.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Added to tasks");
      router.refresh();
    });

  const dismiss = (action: Action, next: boolean) =>
    startTransition(async () => {
      const result = await dismissAction(action.id, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteMeeting(meeting.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Meeting deleted");
      router.push(backTo as Route);
    });

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--stroke)] px-4">
        <Link
          href={backTo as Route}
          className="grid size-7 place-items-center rounded-md text-fg-caption
                     transition-colors duration-[50ms] hover:bg-bg-subtle hover:text-fg-body"
          aria-label="Back to meetings"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.02em] text-fg">
          {meeting.title}
        </h1>

        {/*
          * The re-run stays enabled while `processing` too: a run that dies
          * mid-request leaves the row there permanently, and disabling this
          * would make that state unrecoverable. The cost is that two
          * overlapping runs on one meeting can interleave the route's
          * delete-then-insert of action items — single-user app, one click,
          * judged the better trade against a meeting stuck forever.
          */}
        {!meeting.transcript ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => setTranscriptDialog((p) => ({ open: true, seq: p.seq + 1 }))}
          >
            <Sparkles className="size-3.5" />
            Add transcript
          </Button>
        ) : (
          <Button
            size="sm"
            variant={meeting.ai_status === "failed" ? "primary" : "secondary"}
            onClick={resummarise}
            loading={resummarising}
          >
            {!resummarising && <RefreshCw className="size-3.5" />}
            {meeting.ai_status === "failed" ? "Retry" : "Re-summarise"}
          </Button>
        )}
        <Button size="sm" variant="danger" onClick={remove} disabled={pending}>
          <Trash2 className="size-3.5" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
          {/* -- facts ------------------------------------------------------ */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-fg-muted">
            {meeting.start_time && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5 text-fg-caption" />
                {/*
                  * Same Intl/timezone gap the list has — server zone during
                  * SSR, the reader's afterwards. Withheld until hydration
                  * rather than suppressed: React never patches a mismatched
                  * value, so suppressing would leave the server's timestamp on
                  * screen permanently. No suppressHydrationWarning needed, as
                  * both server and hydration render the same empty string.
                  */}
                {hydrated ? formatDateTime(meeting.start_time) : ""}
              </span>
            )}
            {meeting.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 text-fg-caption" />
                {meeting.location}
              </span>
            )}
            {meeting.ai_status === "failed" && meeting.ai_error && (
              <Chip tone="danger">{meeting.ai_error}</Chip>
            )}
          </div>

          {meeting.attendee_emails.length > 0 && (
            <section className="space-y-2">
              <SectionHeading>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3" />
                  Attendees
                </span>
              </SectionHeading>
              <div className="flex flex-wrap gap-1.5">
                {meeting.attendee_emails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle py-0.5 pl-0.5 pr-2.5 text-[12px] text-fg-muted"
                  >
                    <Avatar email={email} size={18} />
                    {email}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* -- summary ---------------------------------------------------- */}
          {/*
            * Above the whole insights block, not inside the summary.
            *
            * A failed run doesn't erase the last good one — the route leaves
            * summary, key points and decisions untouched, which is the right
            * call: a timeout shouldn't destroy working notes. But a prior run
            * can produce key points and decisions with an empty summary, and
            * nesting this label under `summary &&` hid it in exactly that case,
            * leaving a red error chip above unlabelled content.
            */}
          {meeting.ai_status === "failed" && hasPriorInsights && (
            <p className="text-[12px] text-fg-caption">
              Showing the last successful run — the most recent attempt failed.
            </p>
          )}

          {meeting.summary && (
            <section className="space-y-2">
              <SectionHeading>Summary</SectionHeading>
              <p className="text-[13px] leading-[1.6] text-fg-body">{meeting.summary}</p>
            </section>
          )}

          {meeting.key_points.length > 0 && (
            <section className="space-y-2">
              <SectionHeading>
                <span className="inline-flex items-center gap-1.5">
                  <Lightbulb className="size-3" />
                  Key points
                </span>
              </SectionHeading>
              <ul className="space-y-1.5">
                {meeting.key_points.map((point, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-[1.55] text-fg-body">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-fg-caption" />
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {meeting.decisions.length > 0 && (
            <section className="space-y-2">
              <SectionHeading>Decisions</SectionHeading>
              <ul className="space-y-1.5">
                {meeting.decisions.map((decision, i) => (
                  <li
                    key={i}
                    className="flex gap-2 rounded-md bg-blue-500/[.06] px-2.5 py-1.5 text-[13px] leading-[1.55] text-fg-body"
                  >
                    <Check className="mt-[3px] size-3.5 shrink-0 text-link" />
                    {decision}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* -- action items ----------------------------------------------- */}
          {(open.length > 0 || handled.length > 0) && (
            <section className="space-y-2">
              <SectionHeading>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="size-3" />
                  Action items
                </span>
              </SectionHeading>

              <div className="space-y-1.5">
                {open.map((action) => {
                  const due = dueLabel(action.due_date, hydrated ? clock : null);
                  return (
                    <div
                      key={action.id}
                      className="group/action flex items-start gap-2.5 rounded-lg bg-bg p-2.5
                                 surface
                                 transition-shadow duration-[50ms]
                                 hover:surface-strong"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-[1.45] text-fg-body">
                          {action.description}
                        </p>
                        {(action.owner || action.due_date) && (
                          <div className="mt-1 flex items-center gap-2.5 text-[11px] text-fg-caption">
                            {action.owner && (
                              <span className="inline-flex items-center gap-1">
                                <Avatar name={action.owner} size={14} />
                                {action.owner}
                              </span>
                            )}
                            {action.due_date && <span>{due.label}</span>}
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => promote(action)}
                          disabled={pending}
                        >
                          <Plus className="size-3" />
                          Task
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => dismiss(action, true)}
                          disabled={pending}
                          aria-label="Dismiss"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {handled.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] text-fg-caption"
                  >
                    <Check className="size-3 shrink-0 text-[var(--success)]" />
                    <span className={cn("min-w-0 flex-1 truncate", action.dismissed && "line-through")}>
                      {action.description}
                    </span>
                    {action.task_id ? (
                      <Link href={`/tasks?task=${action.task_id}`} className="shrink-0 text-link hover:underline">
                        View task
                      </Link>
                    ) : (
                      <button
                        onClick={() => dismiss(action, false)}
                        className="shrink-0 transition-colors duration-[50ms] hover:text-fg-body"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* -- notes ------------------------------------------------------ */}
          <section className="space-y-2">
            <SectionHeading>My notes</SectionHeading>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Anything the transcript missed."
            />
            {notes !== savedNotes && (
              <p className="text-[11px] text-fg-caption">Unsaved — click away to save.</p>
            )}
          </section>

          {/* -- transcript ------------------------------------------------- */}
          {meeting.transcript && (
            <section className="space-y-2">
              <button
                onClick={() => setShowTranscript((s) => !s)}
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase
                           tracking-[0.055em] text-fg-subtle transition-colors duration-[50ms]
                           hover:text-fg-body"
              >
                <ChevronDown
                  className={cn(
                    "size-3 transition-transform duration-150",
                    showTranscript && "rotate-180",
                  )}
                />
                Transcript
                <span className="font-normal normal-case tracking-normal text-fg-caption">
                  ({meeting.transcript.split(/\s+/).length.toLocaleString()} words)
                </span>
              </button>

              {showTranscript && (
                <div className="space-y-2 animate-fade-up">
                  {/*
                    * A transcript too short or garbled to summarise would
                    * otherwise be permanent: the header's "Add transcript" only
                    * appears when there isn't one, so there was no way to
                    * replace a bad one and the meeting stayed stuck.
                    */}
                  <Button
                    size="sm"
                    onClick={() => setTranscriptDialog((p) => ({ open: true, seq: p.seq + 1 }))}
                  >
                    <FileText className="size-3.5" />
                    Replace transcript
                  </Button>

                  <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-bg-raised p-3
                                  font-mono text-[12px] leading-[1.6] text-fg-muted surface">
                    {meeting.transcript}
                  </pre>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      <TranscriptDialog
        key={`transcript-${transcriptDialog.seq}`}
        open={transcriptDialog.open}
        onClose={() => setTranscriptDialog((p) => ({ ...p, open: false }))}
        meetingId={meeting.id}
      />
    </>
  );
}
