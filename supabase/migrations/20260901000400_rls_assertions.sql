-- ============================================================================
-- Furnace :: RLS assertions
--
-- A tripwire for the "we forgot one table" class of breach. If any table in
-- `public` ships without RLS, or a user-owned table is missing a policy for one
-- of the four verbs, this raises and the deploy fails loudly instead of
-- silently exposing data.
--
-- Packaged as a FUNCTION rather than a bare DO block on purpose. A migration
-- runs exactly once, so a bare block could not catch a table added by some
-- later migration — which is precisely the failure it exists to prevent. As a
-- function it can be re-run against the live database any time:
--
--     select public.assert_rls_sane();
--
-- The migration calls it once at the bottom, `scripts/test-rls.sh` calls it on
-- every local run, and it should be run against production after each deploy.
-- ============================================================================

create or replace function public.assert_rls_sane()
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  offender text;
  verb     text;
  tbl      text;
begin
  -- 1. Every public table must have RLS enabled. relkind 'p' covers partitioned
  --    tables, which are just as reachable through PostgREST as ordinary ones.
  select string_agg(c.relname, ', ' order by c.relname)
    into offender
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
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

  -- 4. No policy may be granted to anon or to PUBLIC.
  select string_agg(p.tablename || '.' || p.policyname, ', ')
    into offender
  from pg_policies p
  where p.schemaname = 'public'
    and ('anon' = any(p.roles) or 'public' = any(p.roles));

  if offender is not null then
    raise exception 'furnace: policy granted to anon/PUBLIC: %', offender;
  end if;

  -- 5. SECURITY DEFINER views bypass RLS entirely — they run as their owner, so
  --    a single one silently undoes everything above.
  select string_agg(c.relname, ', ')
    into offender
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and c.reloptions is not null
    and array_to_string(c.reloptions, ',') like '%security_definer=true%';

  if offender is not null then
    raise exception 'furnace: SECURITY DEFINER view(s) bypass RLS: %', offender;
  end if;

  -- 6. google_tokens must remain policy-free (service_role access only).
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'google_tokens'
  ) then
    raise exception 'furnace: google_tokens must have NO policies; it is service_role only';
  end if;

  return 'furnace: RLS assertions passed';
end;
$$;

revoke all on function public.assert_rls_sane() from public, anon, authenticated;

-- Run it now, so a bad initial deploy fails here rather than in production.
do $$
begin
  raise notice '%', public.assert_rls_sane();
end;
$$;
