"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  Lightbulb,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
import type { Action, Meeting } from "@/lib/database.types";

export function MeetingDetail({
  meeting,
  actions,
}: {
  meeting: Meeting;
  actions: Action[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Bumped on open so the dialog remounts with an empty form each time.
  const [transcriptDialog, setTranscriptDialog] = useState({ open: false, seq: 0 });
  const [showTranscript, setShowTranscript] = useState(false);
  const [notes, setNotes] = useState(meeting.notes ?? "");
  const [savedNotes, setSavedNotes] = useState(meeting.notes ?? "");

  const open = actions.filter((a) => !a.dismissed && !a.task_id);
  const handled = actions.filter((a) => a.dismissed || a.task_id);

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
      router.push("/meetings");
    });

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--stroke)] px-4">
        <Link
          href="/meetings"
          className="grid size-7 place-items-center rounded-md text-fg-caption
                     transition-colors duration-[50ms] hover:bg-bg-subtle hover:text-fg-body"
          aria-label="Back to meetings"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.02em] text-fg">
          {meeting.title}
        </h1>

        {!meeting.transcript && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => setTranscriptDialog((p) => ({ open: true, seq: p.seq + 1 }))}
          >
            <Sparkles className="size-3.5" />
            Add transcript
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
                {formatDateTime(meeting.start_time)}
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
                  const due = dueLabel(action.due_date);
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
                <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-bg-raised p-3
                                font-mono text-[12px] leading-[1.6] text-fg-muted
                                surface animate-fade-up">
                  {meeting.transcript}
                </pre>
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
