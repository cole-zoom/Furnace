/**
 * Hand-maintained mirror of supabase/migrations/*.sql.
 *
 * Regenerate from the live project once it's linked:
 *   supabase gen types typescript --linked > src/lib/database.types.ts
 *
 * Two shape requirements come from postgrest-js rather than from us, and both
 * fail *silently* if you get them wrong — the typed client falls back to `never`
 * for every payload and every result row, and you get a wall of
 * "Property 'x' does not exist on type 'never'" nowhere near the real cause:
 *
 *   1. Row shapes must be `type` aliases, not `interface`s. Interfaces get no
 *      implicit index signature, so they don't satisfy `Record<string, unknown>`.
 *   2. Every table needs a `Relationships` key.
 */

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type AiStatus = "pending" | "processing" | "complete" | "failed";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Task = {
  id: string;
  user_id: string;
  meeting_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type Meeting = {
  id: string;
  user_id: string;
  google_event_id: string | null;
  title: string;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  attendee_emails: string[];
  transcript: string | null;
  summary: string | null;
  key_points: string[];
  decisions: string[];
  notes: string | null;
  ai_status: AiStatus;
  ai_error: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Action = {
  id: string;
  user_id: string;
  meeting_id: string;
  task_id: string | null;
  description: string;
  owner: string | null;
  due_date: string | null;
  dismissed: boolean;
  created_at: string;
};

export type Person = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  company: string | null;
  role: string | null;
  notes: string | null;
  last_met_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GoogleTokens = {
  user_id: string;
  provider: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  expires_at: string | null;
  scope: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * `Optional` is deliberately not constrained to `keyof T`: tables don't all
 * carry the same server-managed columns (`actions` has no `updated_at`), and a
 * `keyof T` constraint would make the whole schema collapse to `never` the
 * moment one table lists a column it doesn't have.
 */
type Insertable<T, Optional extends PropertyKey> = Omit<
  T,
  Extract<Optional, keyof T>
> &
  Partial<Pick<T, Extract<Optional, keyof T>>>;

/** Columns the database fills in for us — never sent from the client. */
type ServerManaged = "id" | "user_id" | "created_at" | "updated_at";

export type Database = {
  public: {
    Tables: {
      tasks: {
        Row: Task;
        Insert: Insertable<
          Task,
          | ServerManaged
          | "meeting_id"
          | "description"
          | "status"
          | "priority"
          | "due_date"
          | "sort_order"
          | "completed_at"
        >;
        Update: Partial<Task>;
        Relationships: [];
      };
      meetings: {
        Row: Meeting;
        Insert: Insertable<
          Meeting,
          | ServerManaged
          | "google_event_id"
          | "title"
          | "location"
          | "start_time"
          | "end_time"
          | "attendee_emails"
          | "transcript"
          | "summary"
          | "key_points"
          | "decisions"
          | "notes"
          | "ai_status"
          | "ai_error"
          | "processed_at"
        >;
        Update: Partial<Meeting>;
        Relationships: [];
      };
      actions: {
        Row: Action;
        Insert: Insertable<
          Action,
          ServerManaged | "task_id" | "owner" | "due_date" | "dismissed"
        >;
        Update: Partial<Action>;
        Relationships: [];
      };
      people: {
        Row: Person;
        Insert: Insertable<
          Person,
          | ServerManaged
          | "full_name"
          | "email"
          | "company"
          | "role"
          | "notes"
          | "last_met_at"
        >;
        Update: Partial<Person>;
        Relationships: [];
      };
      google_tokens: {
        Row: GoogleTokens;
        Insert: Insertable<
          GoogleTokens,
          | "provider"
          | "access_token_enc"
          | "refresh_token_enc"
          | "expires_at"
          | "scope"
          | "last_synced_at"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<GoogleTokens>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      task_status: TaskStatus;
      task_priority: TaskPriority;
      ai_status: AiStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};

/** Convenience aliases so callers don't have to index into Database by hand. */
type Tables = Database["public"]["Tables"];
export type TaskInsert = Tables["tasks"]["Insert"];
export type TaskUpdate = Tables["tasks"]["Update"];
export type MeetingInsert = Tables["meetings"]["Insert"];
export type MeetingUpdate = Tables["meetings"]["Update"];
export type ActionInsert = Tables["actions"]["Insert"];
export type ActionUpdate = Tables["actions"]["Update"];
export type PersonInsert = Tables["people"]["Insert"];
export type PersonUpdate = Tables["people"]["Update"];
export type GoogleTokensInsert = Tables["google_tokens"]["Insert"];

/** A task joined with the meeting it came out of, for the detail views. */
export type TaskWithMeeting = Task & {
  meetings: Pick<Meeting, "id" | "title" | "start_time"> | null;
};
