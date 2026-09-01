import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { extractMeetingInsights } from "@/lib/gemini";
import type {
  Action,
  ActionInsert,
  Meeting,
  MeetingInsert,
  MeetingUpdate,
} from "@/lib/database.types";

/**
 * POST /api/process-meeting — run a transcript through Gemini and write the
 * results onto a meeting.
 *
 * Ownership is never taken from the request. The caller may nominate a meeting
 * by id, but every read and write is scoped to the session user and passes
 * through RLS on top of that; a meeting belonging to someone else is
 * indistinguishable from one that doesn't exist.
 */

// Long transcripts on a cold model can run well past the default budget.
export const maxDuration = 60;

const bodySchema = z.object({
  meetingId: z.uuid().optional(),
  // Below ~20 characters there is nothing to extract; above 500k the caller is
  // pasting a book, and gemini.ts would elide most of it anyway.
  transcript: z.string().min(20).max(500_000),
  // 500 is the `meetings.title` check constraint — reject here rather than
  // letting Postgres raise mid-flow.
  title: z.string().trim().min(1).max(500).optional(),
  createIfMissing: z.boolean().optional(),
});

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Payloads are built as typed locals so the literals stay checked. */
type MeetingWrite = MeetingUpdate;
type ActionWrite = ActionInsert;

const SECRET_PATTERN = /AIza[0-9A-Za-z_-]{10,}/g;

/**
 * `ai_error` is rendered in the UI and lives in the database indefinitely, so
 * it gets the message and nothing else — no stack, no request URL, no key.
 */
function sanitizeError(error: unknown): string {
  // PostgrestError is a plain object, not an Error, so don't rely on instanceof.
  const raw =
    typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "Unknown error";

  return raw.replace(SECRET_PATTERN, "[redacted]").split("\n")[0].slice(0, 300);
}

/** Best-effort: a failure to record the failure must not mask the real one. */
async function markFailed(
  supabase: Supabase,
  meetingId: string,
  userId: string,
  message: string,
) {
  const patch: MeetingWrite = { ai_status: "failed", ai_error: message };

  const { error } = await supabase
    .from("meetings")
    .update(patch)
    .eq("id", meetingId)
    .eq("user_id", userId);

  if (error) console.error("[process-meeting] could not record failure:", error.message);
}

/** First non-empty line of the transcript, which is usually close enough. */
function deriveTitle(transcript: string): string {
  const firstLine = transcript
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return "Untitled meeting";
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }

  const { meetingId, transcript, title, createIfMissing } = parsed.data;

  if (!meetingId && !createIfMissing) {
    return NextResponse.json(
      { error: "Provide a meetingId, or set createIfMissing to create one." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  let meeting: Meeting;

  if (meetingId) {
    const patch: MeetingWrite = {
      transcript,
      ai_status: "processing",
      ai_error: null,
      ...(title ? { title } : {}),
    };

    // The update doubles as the existence check: zero rows means the meeting is
    // missing *or* someone else's, and the caller learns nothing about which.
    const { data, error } = await supabase
      .from("meetings")
      .update(patch)
      .eq("id", meetingId)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("[process-meeting] meeting update failed:", error.message);
      return NextResponse.json({ error: "Could not load the meeting." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

    meeting = data;
  } else {
    const draft: MeetingInsert = {
      user_id: user.id,
      title: title ?? deriveTitle(transcript),
      transcript,
      ai_status: "processing",
    };

    const { data, error } = await supabase
      .from("meetings")
      .insert(draft)
      .select()
      .single();

    if (error || !data) {
      console.error("[process-meeting] meeting insert failed:", error?.message);
      return NextResponse.json({ error: "Could not create the meeting." }, { status: 500 });
    }

    meeting = data;
  }

  let insights;
  try {
    insights = await extractMeetingInsights({
      transcript,
      title: meeting.title,
      meetingDate: meeting.start_time ?? meeting.created_at,
    });
  } catch (error) {
    const message = sanitizeError(error);
    await markFailed(supabase, meeting.id, user.id, message);

    if (error instanceof Error && error.message === "GEMINI_NOT_CONFIGURED") {
      return NextResponse.json(
        {
          error:
            "AI processing isn't configured. Set GEMINI_API_KEY in .env.local " +
            "(get one at https://aistudio.google.com/apikey) and restart the server.",
          meetingId: meeting.id,
        },
        { status: 503 },
      );
    }

    console.error("[process-meeting] extraction failed:", error);
    return NextResponse.json(
      { error: "Could not process this transcript.", detail: message, meetingId: meeting.id },
      { status: 502 },
    );
  }

  // Re-processing replaces the model's previous read of the meeting. Actions the
  // user already promoted to a task are theirs now, so those stay.
  const { error: clearError } = await supabase
    .from("actions")
    .delete()
    .eq("meeting_id", meeting.id)
    .eq("user_id", user.id)
    .is("task_id", null);

  if (clearError) {
    const message = sanitizeError(clearError);
    await markFailed(supabase, meeting.id, user.id, message);
    console.error("[process-meeting] could not clear stale actions:", clearError.message);
    return NextResponse.json({ error: "Could not save the results.", detail: message }, { status: 500 });
  }

  let actions: Action[] = [];
  if (insights.action_items.length > 0) {
    // 2000 is the `actions.description` check constraint.
    const rows: ActionWrite[] = insights.action_items.map((item) => ({
      user_id: user.id,
      meeting_id: meeting.id,
      description: item.task.slice(0, 2000),
      owner: item.person,
      due_date: item.due_date,
    }));

    const { data, error } = await supabase
      .from("actions")
      .insert(rows)
      .select();

    if (error || !data) {
      const message = sanitizeError(error);
      await markFailed(supabase, meeting.id, user.id, message);
      console.error("[process-meeting] action insert failed:", error?.message);
      return NextResponse.json({ error: "Could not save the results.", detail: message }, { status: 500 });
    }

    actions = data;
  }

  const result: MeetingWrite = {
    summary: insights.summary,
    key_points: insights.key_points,
    decisions: insights.decisions,
    ai_status: "complete",
    ai_error: null,
    processed_at: new Date().toISOString(),
  };

  // Flipped to complete last, so a half-written meeting never reads as done.
  const { data: updated, error: finalizeError } = await supabase
    .from("meetings")
    .update(result)
    .eq("id", meeting.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (finalizeError || !updated) {
    const message = sanitizeError(finalizeError);
    await markFailed(supabase, meeting.id, user.id, message);
    console.error("[process-meeting] could not finalize meeting:", finalizeError?.message);
    return NextResponse.json({ error: "Could not save the results.", detail: message }, { status: 500 });
  }

  return NextResponse.json({ meeting: updated, actions });
}
