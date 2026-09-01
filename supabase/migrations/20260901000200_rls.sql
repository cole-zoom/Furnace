-- ============================================================================
-- Furnace :: Row Level Security
--
-- Threat model: the browser holds a publishable (anon) key and a user JWT, and
-- can call PostgREST directly for ANY table. So the database — not the app — is
-- the security boundary. Rules applied here:
--
--   1. RLS is ON for every table in `public`. No exceptions.
--   2. Every policy is scoped `to authenticated`. `anon` never matches anything.
--   3. UPDATE policies carry BOTH `using` and `with check`. Without `with check`
--      a user could UPDATE their own row and reassign `user_id` to someone
--      else, or worse, walk rows into another tenant. This is the single most
--      commonly missed hole in Supabase RLS.
--   4. `auth.uid()` is wrapped in `(select ...)` so Postgres hoists it to an
--      InitPlan and evaluates it once per query instead of once per row.
--   5. Foreign keys that point at another owned table are re-validated in the
--      policy, so a row can never be stapled onto a stranger's parent record.
--   6. google_tokens has RLS on and ZERO policies, plus explicit REVOKEs. It is
--      reachable only by service_role, from server code. OAuth refresh tokens
--      must never be fetchable with an anon key.
-- ============================================================================

alter table public.people        enable row level security;
alter table public.meetings      enable row level security;
alter table public.tasks         enable row level security;
alter table public.actions       enable row level security;
alter table public.google_tokens enable row level security;

-- Nothing in this app is public. Strip anon down to nothing on every table.
revoke all on public.people, public.meetings, public.tasks, public.actions, public.google_tokens from anon;

-- ---------------------------------------------------------------- people ---
create policy "people: select own" on public.people
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "people: insert own" on public.people
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "people: update own" on public.people
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "people: delete own" on public.people
  for delete to authenticated using ((select auth.uid()) = user_id);

-- -------------------------------------------------------------- meetings ---
create policy "meetings: select own" on public.meetings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "meetings: insert own" on public.meetings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "meetings: update own" on public.meetings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "meetings: delete own" on public.meetings
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------- tasks ---
-- meeting_id is optional, but if set it must point at a meeting you own.
create policy "tasks: select own" on public.tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "tasks: insert own" on public.tasks
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      meeting_id is null
      or exists (
        select 1 from public.meetings m
        where m.id = meeting_id and m.user_id = (select auth.uid())
      )
    )
  );
create policy "tasks: update own" on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      meeting_id is null
      or exists (
        select 1 from public.meetings m
        where m.id = meeting_id and m.user_id = (select auth.uid())
      )
    )
  );
create policy "tasks: delete own" on public.tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- --------------------------------------------------------------- actions ---
-- Both parents (meeting, task) are re-checked for ownership.
create policy "actions: select own" on public.actions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "actions: insert own" on public.actions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_id and m.user_id = (select auth.uid())
    )
    and (
      task_id is null
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and t.user_id = (select auth.uid())
      )
    )
  );
create policy "actions: update own" on public.actions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_id and m.user_id = (select auth.uid())
    )
    and (
      task_id is null
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and t.user_id = (select auth.uid())
      )
    )
  );
create policy "actions: delete own" on public.actions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- --------------------------------------------------------- google_tokens ---
-- Deliberately NO policies. RLS with an empty policy set denies everything to
-- every non-bypassing role, and the REVOKE means PostgREST won't even expose it.
revoke all on public.google_tokens from anon, authenticated;
