import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listCalendarEvents, markSynced, type CalendarEvent } from "@/lib/google";
import type { MeetingInsert, PersonInsert } from "@/lib/database.types";

/**
 * Calendar → CRM sync.
 *
 * Idempotent by design: run it as often as you like. The one hard rule is that
 * a re-sync must never destroy human or AI work — a meeting's transcript,
 * summary, notes, key_points, decisions and ai_status belong to the app, not to
 * Google, and this route only ever writes the calendar-derived columns.
 */

export const maxDuration = 60;

type MeetingWrite = MeetingInsert;
type PersonWrite = PersonInsert;

/** Google books conference rooms as attendees on this domain. They aren't people. */
const ROOM_DOMAIN = "@resource.calendar.google.com";

/** `title` is capped at 500 chars by a CHECK constraint. */
const MAX_TITLE = 500;

/** Keeps `?col=in.(...)` filters well clear of proxy URL length limits. */
const IN_CHUNK = 100;

const bodySchema = z.object({
  daysBack: z.number().int().min(0).max(90).default(14),
  daysForward: z.number().int().min(0).max(90).default(21),
});

/**
 * Errors whose message has been authored by us and is therefore safe to log and
 * to hand back to the client. Everything else is treated as radioactive: the
 * failures thrown out of `google.ts` can carry a raw Google response body, and
 * a refresh failure can echo credential material back at us.
 */
class SyncError extends Error {}

/** The shape written to `meetings`. Deliberately excludes every AI/user column. */
interface CalendarColumns {
  google_event_id: string;
  title: string;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  attendee_emails: string[];
}

interface Sighting {
  email: string;
  displayName: string | null;
  lastMetAt: string | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function laterIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

// All-day events carry only `date`; timed ones carry `dateTime`. Postgres
// accepts both into a timestamptz, so pass the value straight through.
function toTimestamp(slot: CalendarEvent["start"]): string | null {
  return slot?.dateTime ?? slot?.date ?? null;
}

/** Real human attendees, lowercased and de-duplicated, mapped to their best display name. */
function humanAttendees(
  event: CalendarEvent,
  selfEmail: string | null,
): Map<string, string | null> {
  const found = new Map<string, string | null>();

  for (const attendee of event.attendees ?? []) {
    const email = attendee.email?.trim().toLowerCase();
    if (!email) continue;
    if (attendee.self || email === selfEmail) continue;
    if (email.endsWith(ROOM_DOMAIN)) continue;

    const name = attendee.displayName?.trim() || null;
    // Google omits displayName on some copies of the same invitee, so a named
    // sighting always beats an anonymous one.
    if (!found.get(email)) found.set(email, name);
  }

  return found;
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // A bodyless POST is the common case ("just sync"), so an unparseable body is
  // only an error once it's actually present and wrong.
  const raw: unknown = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid sync window.",
        issues: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const { daysBack, daysForward } = parsed.data;
  const now = Date.now();
  const window = {
    from: new Date(now - daysBack * 86_400_000).toISOString(),
    to: new Date(now + daysForward * 86_400_000).toISOString(),
  };

  try {
    const supabase = await createClient();
    const selfEmail = user.email?.trim().toLowerCase() ?? null;
    const events = await listCalendarEvents(user.id, { daysBack, daysForward });

    // ------------------------------------------------------------ map events
    const rows = new Map<string, CalendarColumns>();
    const sightings = new Map<string, Sighting>();

    for (const event of events) {
      if (!event.id) continue;

      const startTime = toTimestamp(event.start);
      let endTime = toTimestamp(event.end);
      // `meetings_time_order` would reject an inverted pair and take the whole
      // batch down with it. One malformed event isn't worth failing the sync.
      if (startTime && endTime && Date.parse(endTime) < Date.parse(startTime)) {
        endTime = null;
      }

      const attendees = humanAttendees(event, selfEmail);

      rows.set(event.id, {
        google_event_id: event.id,
        title: (event.summary?.trim() || "Untitled meeting").slice(0, MAX_TITLE),
        location: event.location?.trim() || null,
        start_time: startTime,
        end_time: endTime,
        attendee_emails: [...attendees.keys()],
      });

      for (const [email, displayName] of attendees) {
        const previous = sightings.get(email);
        sightings.set(email, {
          email,
          displayName: previous?.displayName ?? displayName,
          lastMetAt: laterIso(previous?.lastMetAt ?? null, startTime),
        });
      }
    }

    const calendarRows = [...rows.values()];

    // --------------------------------------------------------- meetings i/o
    //
    // Two passes rather than one `.upsert()`, for two reasons:
    //
    //  1. `meetings_user_google_event_key` is a PARTIAL unique index (`where
    //     google_event_id is not null`). Postgres can only infer a partial index
    //     for ON CONFLICT when the predicate is restated, and PostgREST has no
    //     way to emit that — so an upsert on (user_id, google_event_id) simply
    //     errors out.
    //  2. It keeps created/updated counts honest.
    //
    // Both writes send arrays whose objects all carry an identical key set, so
    // PostgREST's column list is exactly the calendar columns; transcript,
    // summary, notes, key_points, decisions and ai_status are never named in the
    // statement and so cannot be reset.
    const existingMeetingId = new Map<string, string>();
    for (const ids of chunk([...rows.keys()], IN_CHUNK)) {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, google_event_id")
        .eq("user_id", user.id)
        .in("google_event_id", ids);

      if (error) throw new SyncError(`Could not read existing meetings: ${error.message}`);
      for (const row of data ?? []) {
        if (row.google_event_id) existingMeetingId.set(row.google_event_id, row.id);
      }
    }

    const meetingInserts: MeetingWrite[] = [];
    const meetingUpdates: MeetingWrite[] = [];

    for (const row of calendarRows) {
      const id = existingMeetingId.get(row.google_event_id);
      if (id) meetingUpdates.push({ ...row, id, user_id: user.id });
      else meetingInserts.push({ ...row, user_id: user.id });
    }

    if (meetingInserts.length > 0) {
      const { error } = await supabase.from("meetings").insert(meetingInserts);
      if (error) throw new SyncError(`Could not create meetings: ${error.message}`);
    }

    if (meetingUpdates.length > 0) {
      // Conflict target is the primary key, so this is a bulk UPDATE in one
      // round trip — and `id` is a real (non-partial) unique index.
      const { error } = await supabase
        .from("meetings")
        .upsert(meetingUpdates, { onConflict: "id" });
      if (error) throw new SyncError(`Could not update meetings: ${error.message}`);
    }

    // ----------------------------------------------------------- people i/o
    const emails = [...sightings.keys()];
    const existingPeople = new Map<
      string,
      { id: string; full_name: string | null; last_met_at: string | null }
    >();

    for (const batch of chunk(emails, IN_CHUNK)) {
      const { data, error } = await supabase
        .from("people")
        .select("id, email, full_name, last_met_at")
        .eq("user_id", user.id)
        .in("email", batch);

      if (error) throw new SyncError(`Could not read existing people: ${error.message}`);
      for (const row of data ?? []) {
        if (!row.email) continue;
        // `email` is citext, so the stored casing may differ from ours.
        existingPeople.set(row.email.toLowerCase(), {
          id: row.id,
          full_name: row.full_name,
          last_met_at: row.last_met_at,
        });
      }
    }

    const personInserts: PersonWrite[] = [];
    const personUpdates: PersonWrite[] = [];

    for (const sighting of sightings.values()) {
      const existing = existingPeople.get(sighting.email);

      if (!existing) {
        personInserts.push({
          user_id: user.id,
          email: sighting.email,
          full_name: sighting.displayName,
          last_met_at: sighting.lastMetAt,
        });
        continue;
      }

      // A name the user curated outranks whatever Google's invite says, and
      // `company` / `role` / `notes` are omitted entirely so they stay untouched.
      personUpdates.push({
        id: existing.id,
        user_id: user.id,
        full_name: existing.full_name ?? sighting.displayName,
        last_met_at: laterIso(existing.last_met_at, sighting.lastMetAt),
      });
    }

    if (personInserts.length > 0) {
      const { error } = await supabase.from("people").insert(personInserts);
      if (error) throw new SyncError(`Could not create people: ${error.message}`);
    }

    if (personUpdates.length > 0) {
      const { error } = await supabase
        .from("people")
        .upsert(personUpdates, { onConflict: "id" });
      if (error) throw new SyncError(`Could not update people: ${error.message}`);
    }

    await markSynced(user.id);

    return NextResponse.json({
      synced: calendarRows.length,
      created: meetingInserts.length,
      updated: meetingUpdates.length,
      people: personInserts.length + personUpdates.length,
      window,
    });
  } catch (err) {
    const sentinel = err instanceof Error ? err.message : "";

    if (sentinel === "GOOGLE_NOT_CONNECTED") {
      return NextResponse.json(
        {
          error: "Google Calendar is not connected.",
          code: "GOOGLE_NOT_CONNECTED",
          message: "Connect Google Calendar in Settings first.",
        },
        { status: 409 },
      );
    }

    if (sentinel === "GOOGLE_NEEDS_RECONSENT") {
      return NextResponse.json(
        {
          error: "Google Calendar access has expired.",
          code: "GOOGLE_NEEDS_RECONSENT",
          message:
            "Reconnect Google from Settings so we can obtain a fresh refresh token.",
        },
        { status: 409 },
      );
    }

    if (err instanceof SyncError) {
      console.error("[calendar/sync]", err.message);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    // Deliberately opaque: an unrecognised failure may carry an access token, a
    // refresh token, or a raw Google response body in its message.
    console.error(
      "[calendar/sync] unexpected failure:",
      err instanceof Error ? err.name : typeof err,
    );
    return NextResponse.json(
      { error: "Calendar sync failed. Please try again." },
      { status: 500 },
    );
  }
}
