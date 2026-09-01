-- ============================================================================
-- Furnace :: RLS assertions
--
-- A deploy-time tripwire. If any table in `public` ships without RLS, or a
-- user-owned table is missing a policy for one of the four verbs, this
-- migration aborts and the deploy fails loudly instead of silently exposing
-- data. Cheap insurance against the "we forgot one table" class of breach.
-- ============================================================================

do $$
declare
  offender text;
  verb     text;
  tbl      text;
begin
  -- 1. Every public table must have RLS enabled.
  select string_agg(c.relname, ', ')
    into offender
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if offender is not null then
    raise exception 'furnace: RLS is DISABLED on public table(s): %', offender;
  end if;

  -- 2. Every user-owned table must have all four verbs covered.
  foreach tbl in array array['people', 'meetings', 'tasks', 'actions'] loop
    foreach verb in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = tbl
          and p.cmd = verb
      ) then
        raise exception 'furnace: table public.% has no % policy', tbl, verb;
      end if;
    end loop;
  end loop;

  -- 3. Every UPDATE policy must carry a WITH CHECK clause, or user_id can be
  --    reassigned out from under us.
  select string_agg(p.tablename || '.' || p.policyname, ', ')
    into offender
  from pg_policies p
  where p.schemaname = 'public'
    and p.cmd = 'UPDATE'
    and p.with_check is null;

  if offender is not null then
    raise exception 'furnace: UPDATE policy without WITH CHECK: %', offender;
  end if;

  -- 4. google_tokens must remain policy-free (service_role access only).
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'google_tokens'
  ) then
    raise exception 'furnace: google_tokens must have NO policies; it is service_role only';
  end if;

  raise notice 'furnace: RLS assertions passed';
end;
$$;
