"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

/**
 * Granola's free tier has no API, so the workflow is: copy the transcript out
 * of Granola, paste it here, let Gemini do the rest. Deliberately forgiving
 * about what gets pasted — speaker labels, timestamps and all.
 */
export function TranscriptDialog({
  open,
  onClose,
  meetingId,
}: {
  open: boolean;
  onClose: () => void;
  /** Attach to an existing meeting instead of creating a new one. */
  meetingId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Callers pass a fresh `key` on each open, so mounting is the reset.
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;

  const submit = () => {
    if (transcript.trim().length < 20) {
      toast.error("That transcript looks too short to summarise.");
      return;
    }

    startTransition(async () => {
      const pendingToast = toast.loading("Reading the transcript…");
      try {
        const res = await fetch("/api/process-meeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meetingId,
            transcript,
            title: title.trim() || undefined,
            createIfMissing: !meetingId,
          }),
        });

        const body = await res.json();
        if (!res.ok) {
          throw new Error(body.message ?? body.error ?? "Could not process that transcript.");
        }

        const count = body.actions?.length ?? 0;
        toast.success(
          count > 0
            ? `Summarised · ${count} action item${count === 1 ? "" : "s"} found`
            : "Summarised",
          { id: pendingToast },
        );

        onClose();
        if (body.meeting?.id) router.push(`/meetings/${body.meeting.id}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong", {
          id: pendingToast,
        });
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Paste meeting transcript"
      description="Drop in the raw transcript from Granola. Gemini pulls out the summary, decisions and action items."
      className="max-w-2xl"
      footer={
        <>
          <span className="mr-auto text-[12px] text-fg-caption">
            {wordCount > 0 && `${wordCount.toLocaleString()} words`}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} loading={pending}>
            {!pending && <Sparkles className="size-3.5" />}
            Summarise
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {!meetingId && (
          <Field label="Meeting title" hint="Optional — we'll derive one if you leave it blank.">
            <Input
              data-autofocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly sync with the platform team"
            />
          </Field>
        )}

        <Field label="Transcript">
          <Textarea
            rows={14}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={"Paste the whole thing — speaker labels, timestamps, all of it."}
            className="font-mono text-[12px] leading-[1.55]"
          />
        </Field>
      </div>
    </Dialog>
  );
}
