-- ============================================================================
-- Furnace :: core schema
-- Personal CRM. Single-tenant-by-RLS: every row is owned by exactly one
-- auth.users id, and nothing is ever readable across users.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext   with schema extensions;

-- ---------------------------------------------------------------- enums ----
create type public.task_status   as enum ('todo', 'in_progress', 'blocked', 'done');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.ai_status     as enum ('pending', 'processing', 'complete', 'failed');

-- ------------------------------------------------------------ utilities ----
-- Bump updated_at on every write.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Keep completed_at consistent with status so the UI never has to guess.
create or replace function public.sync_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- people ---
-- The "R" in CRM. Attendees seen on calendar events land here automatically.
create table public.people (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  full_name   text,
  email       extensions.citext,
  company     text,
  role        text,
  notes       text check (char_length(notes) <= 20000),
  last_met_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint people_identified check (full_name is not null or email is not null)
);

create unique index people_user_email_key on public.people (user_id, email) where email is not null;
create index people_user_last_met_idx on public.people (user_id, last_met_at desc nulls last);

-- -------------------------------------------------------------- meetings ---
create table public.meetings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  google_event_id text,
  title           text not null default 'Untitled meeting' check (char_length(title) <= 500),
  location        text,
  start_time      timestamptz,
  end_time        timestamptz,
  attendee_emails extensions.citext[] not null default '{}',
  transcript      text,
  summary         text,
  key_points      jsonb not null default '[]'::jsonb,
  decisions       jsonb not null default '[]'::jsonb,
  notes           text,
  ai_status       public.ai_status not null default 'pending',
  ai_error        text,
  processed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint meetings_time_order check (end_time is null or start_time is null or end_time >= start_time),
  constraint meetings_key_points_is_array check (jsonb_typeof(key_points) = 'array'),
  constraint meetings_decisions_is_array  check (jsonb_typeof(decisions)  = 'array')
);

-- One row per Google event, per user. Makes calendar sync idempotent.
create unique index meetings_user_google_event_key
  on public.meetings (user_id, google_event_id) where google_event_id is not null;
create index meetings_user_start_idx on public.meetings (user_id, start_time desc nulls last);
create index meetings_transcript_fts_idx
  on public.meetings using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(transcript,'')));

-- ----------------------------------------------------------------- tasks ---
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meeting_id   uuid references public.meetings(id) on delete set null,
  title        text not null check (char_length(title) between 1 and 500),
  description  text check (char_length(description) <= 20000),
  status       public.task_status   not null default 'todo',
  priority     public.task_priority not null default 'medium',
  due_date     date,
  -- Fractional index: lets the kanban drop a card between two others without
  -- rewriting the whole column.
  sort_order   double precision not null default extract(epoch from now()),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index tasks_user_board_idx on public.tasks (user_id, status, sort_order);
create index tasks_user_due_idx   on public.tasks (user_id, due_date) where due_date is not null;
create index tasks_user_meeting_idx on public.tasks (user_id, meeting_id) where meeting_id is not null;

-- --------------------------------------------------------------- actions ---
-- Raw action items as extracted by the AI. Kept distinct from tasks so we can
-- show "here's what the model heard" and let the user promote items they want.
-- Carries its own user_id so RLS stays a simple column compare (no subquery).
create table public.actions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete set null,
  description text not null check (char_length(description) between 1 and 2000),
  owner       text,
  due_date    date,
  dismissed   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index actions_user_meeting_idx on public.actions (user_id, meeting_id);
create index actions_open_idx on public.actions (user_id) where task_id is null and dismissed = false;

-- --------------------------------------------------------- google_tokens ---
-- Google OAuth material. NEVER exposed to the browser: see the RLS migration,
-- which locks this table to service_role only.
create table public.google_tokens (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  provider              text not null default 'google',
  access_token_enc      text,
  refresh_token_enc     text,
  expires_at            timestamptz,
  scope                 text,
  last_synced_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- -------------------------------------------------------------- triggers ---
create trigger people_touch        before update on public.people        for each row execute function public.touch_updated_at();
create trigger meetings_touch      before update on public.meetings      for each row execute function public.touch_updated_at();
create trigger tasks_touch         before update on public.tasks         for each row execute function public.touch_updated_at();
create trigger google_tokens_touch before update on public.google_tokens for each row execute function public.touch_updated_at();
create trigger tasks_sync_completed before update on public.tasks        for each row execute function public.sync_completed_at();
